import { ZoraMonitor } from './monitor';

const monitor = new ZoraMonitor();

// Signal handlers for graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT signal, shutting down...');
  await monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM signal, shutting down...');
  await monitor.stop();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Start monitoring
async function main() {
  try {
    await monitor.start();
  } catch (error) {
    console.error('Critical error:', error);
    process.exit(1);
  }
}

main(); 