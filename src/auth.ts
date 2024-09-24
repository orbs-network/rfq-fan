import { Request, Response, NextFunction } from 'express';
import redisWrapper from './redis'
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');

  if (!apiKey) {
    return res.status(401).json({ error: 'API key missing' });
  }

  try {
    // Check if the API key exists in Redis
    const exists = await redisWrapper.Client.exists(`api_keys:${apiKey}`);

    if (exists) {
      // Optionally, you can retrieve associated data
      // const userData = await redisWrapper.Client.get(`api_keys:${apiKey}`);
      next();
    } else {
      res.status(401).json({ error: 'Invalid API key' });
    }
  } catch (err) {
    console.error('Error checking API key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Function to generate and store a hashed API key
// Function to generate a new API key for a user
export async function generateApiKey(username: string): Promise<string> {
  const apiKey = crypto.randomBytes(32).toString('hex');
  // Store the API key and username in Redis
  await redisWrapper.Client.set(`api_keys:${apiKey}`, username);
  return apiKey;
}

// Updated middleware to compare hashed API keys
async function apiKeyAuthHashed(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');

  if (!apiKey) {
    return res.status(401).json({ error: 'API key missing' });
  }

  try {
    // Retrieve all hashed API keys
    const keys = await redisWrapper.Client.keys('api_keys_hashed:*');

    // Check if the provided API key matches any hashed key
    for (const key of keys) {
      const hashedKey = key.replace('api_keys_hashed:', '');
      const match = await bcrypt.compare(apiKey, hashedKey);
      if (match) {
        return next();
      }
    }

    res.status(401).json({ error: 'Invalid API key' });
  } catch (err) {
    console.error('Error checking API key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
