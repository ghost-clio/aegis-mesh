/**
 * Append-only audit log for Aegis Mesh.
 * Every policy decision, payment, and governance change is recorded.
 */

export function createAuditLog() {
  const entries = [];

  return {
    log(entry) {
      entries.push({ ...entry, seq: entries.length });
    },

    getAll() {
      return [...entries];
    },

    getByType(type) {
      return entries.filter(e => e.type === type);
    },

    getByAgent(agentId) {
      return entries.filter(e => e.buyerId === agentId);
    },

    getByChain(chain) {
      return entries.filter(e => e.chain === chain);
    },

    getDenials() {
      return entries.filter(e => e.decision === 'denied');
    },

    getStats() {
      const payments = entries.filter(e => e.type === 'payment_settled');
      const denials = entries.filter(e => e.decision === 'denied');
      const policyUpdates = entries.filter(e => e.type.includes('policy'));
      return {
        totalEntries: entries.length,
        payments: payments.length,
        denials: denials.length,
        policyUpdates: policyUpdates.length,
        byChain: {
          arbitrum: payments.filter(e => e.chain === 'arbitrum').length,
          xrplEvm: payments.filter(e => e.chain === 'xrplEvm').length,
        },
      };
    },

    size() {
      return entries.length;
    },
  };
}
