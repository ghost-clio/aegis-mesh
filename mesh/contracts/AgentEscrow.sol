// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AgentEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Status { Created, Claimed, Refunded }

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        string serviceId;
        uint256 createdAt;
        uint256 timeoutSeconds;
        Status status;
    }

    // Public state
    IERC20 public usdc;
    mapping(uint256 => Escrow) public escrows;
    uint256 public nextEscrowId;

    // Events
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        string serviceId,
        uint256 timeoutSeconds
    );
    event EscrowClaimed(uint256 indexed escrowId, address indexed seller);
    event EscrowRefunded(uint256 indexed escrowId, address indexed buyer);

    /// @notice Reject accidental ETH deposits
    receive() external payable { revert("No ETH accepted"); }

    /**
     * @param _usdc Address of the USDC ERC-20 token on Arbitrum
     */
    constructor(address _usdc) {
        require(_usdc != address(0), "USDC address cannot be zero");
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Create an escrow deposit
     * @param _seller Address of the seller
     * @param _amount Amount of USDC to lock (in wei, i.e., 6 decimals for USDC)
     * @param _serviceId Identifier for the service being escrowed
     * @param _timeoutSeconds Seconds after which the buyer can refund
     */
    function createEscrow(
        address _seller,
        uint256 _amount,
        string calldata _serviceId,
        uint256 _timeoutSeconds
    ) external nonReentrant {
        require(_seller != address(0), "Seller cannot be zero");
        require(_seller != msg.sender, "Buyer and seller must differ");
        require(_amount > 0, "Amount must be greater than zero");
        require(_timeoutSeconds > 0, "Timeout must be greater than zero");
        require(bytes(_serviceId).length <= 128, "serviceId too long");

        // State changes BEFORE external call (checks-effects-interactions)
        uint256 escrowId = nextEscrowId++;
        Escrow storage escrow = escrows[escrowId];
        escrow.buyer = msg.sender;
        escrow.seller = _seller;
        escrow.amount = _amount;
        escrow.serviceId = _serviceId;
        escrow.createdAt = block.timestamp;
        escrow.timeoutSeconds = _timeoutSeconds;
        escrow.status = Status.Created;

        // External call AFTER state changes (checks-effects-interactions pattern)
        usdc.safeTransferFrom(msg.sender, address(this), _amount);

        emit EscrowCreated(escrowId, msg.sender, _seller, _amount, _serviceId, _timeoutSeconds);
    }

    /**
     * @notice Seller claims the escrow funds
     * @param _escrowId ID of the escrow to claim
     */
    function claimEscrow(uint256 _escrowId) external nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == Status.Created, "Escrow not available for claim");
        require(escrow.seller == msg.sender, "Only seller can claim");
        require(escrow.amount > 0, "Zero amount");

        escrow.status = Status.Claimed;
        // Transfer funds to seller (SafeERC20 reverts on failure)
        usdc.safeTransfer(escrow.seller, escrow.amount);

        emit EscrowClaimed(_escrowId, escrow.seller);
    }

    /**
     * @notice Buyer refunds the escrow after timeout
     * @param _escrowId ID of the escrow to refund
     */
    function refundEscrow(uint256 _escrowId) external nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.status == Status.Created, "Escrow not available for refund");
        require(escrow.buyer == msg.sender, "Only buyer can refund");
        require(
            block.timestamp >= escrow.createdAt + escrow.timeoutSeconds,
            "Timeout not reached"
        );

        escrow.status = Status.Refunded;
        // Transfer funds back to buyer (SafeERC20 reverts on failure)
        usdc.safeTransfer(escrow.buyer, escrow.amount);

        emit EscrowRefunded(_escrowId, escrow.buyer);
    }

    /**
     * @notice View escrow details
     * @param _escrowId ID of the escrow
     * @return buyer The buyer address
     * @return seller The seller address
     * @return amount The escrowed amount
     * @return serviceId The service identifier
     * @return createdAt The creation timestamp
     * @return timeoutSeconds The timeout in seconds
     * @return status The escrow status (0=Created, 1=Claimed, 2=Refunded)
     */
    function getEscrow(uint256 _escrowId)
        external
        view
        returns (
            address buyer,
            address seller,
            uint256 amount,
            string memory serviceId,
            uint256 createdAt,
            uint256 timeoutSeconds,
            uint8 status
        )
    {
        Escrow storage escrow = escrows[_escrowId];
        buyer = escrow.buyer;
        seller = escrow.seller;
        amount = escrow.amount;
        serviceId = escrow.serviceId;
        createdAt = escrow.createdAt;
        timeoutSeconds = escrow.timeoutSeconds;
        status = uint8(escrow.status);
    }
}
