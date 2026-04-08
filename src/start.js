import { createGateway } from './gateway.js';
const port = parseInt(process.env.PORT || '3404');
const { start } = createGateway(port);
start();
