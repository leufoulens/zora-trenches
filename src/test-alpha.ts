import { RedisClient } from './redis-client';
import dotenv from 'dotenv';

dotenv.config();

async function testAlphaList() {
  const redisClient = new RedisClient();
  
  try {
    await redisClient.connect();
    console.log('✅ Redis connected');

    // Test adding users to alpha list
    console.log('\n🔧 Testing alpha list functionality...');
    
    const testUsers = ['ufo', 'wakeupremember', 'wethemniggas'];
    const addedCount = await redisClient.addToAlphaList(testUsers);
    console.log(`➕ Added ${addedCount} users to alpha list`);

    // Test getting alpha list
    const alphaList = await redisClient.getAlphaList();
    console.log(`📋 Alpha list contains ${alphaList.length} users:`, alphaList);

    // Test checking if user is in alpha list
    for (const user of testUsers) {
      const isInList = await redisClient.isInAlphaList(user);
      console.log(`🔍 User "${user}" is in alpha list: ${isInList}`);
    }

    // Test case sensitivity
    const isInListUpper = await redisClient.isInAlphaList('UFO');
    console.log(`🔍 User "UFO" (uppercase) is in alpha list: ${isInListUpper}`);

    // Test removing user
    const removed = await redisClient.removeFromAlphaList('ufo');
    console.log(`➖ Removed "ufo": ${removed}`);

    // Check final state
    const finalList = await redisClient.getAlphaList();
    console.log(`📋 Final alpha list contains ${finalList.length} users:`, finalList);

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await redisClient.disconnect();
    console.log('📤 Redis disconnected');
  }
}

testAlphaList(); 