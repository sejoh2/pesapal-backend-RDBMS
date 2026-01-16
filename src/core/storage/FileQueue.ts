import fs from 'fs/promises';
import path from 'path';

export class FileQueue {
  private queue: Array<{ filePath: string; data: any }> = [];
  private isProcessing: boolean = false;
  private retryAttempts: Map<string, number> = new Map();
  private readonly MAX_RETRIES = 3;

  async enqueue(filePath: string, data: any): Promise<void> {
    this.queue.push({ filePath, data });
    
    // If not already processing, start processing
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift()!;

    try {
      // Ensure directory exists
      const dir = path.dirname(item.filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(item.filePath, JSON.stringify(item.data), 'utf-8');
      
      // Clear retry attempts for this file
      this.retryAttempts.delete(item.filePath);
      
      console.log(`💾 Saved to ${item.filePath}`);
      
      // Process next item immediately
      setImmediate(() => this.processQueue());
      
    } catch (error) {
      console.error(`❌ Error saving file ${item.filePath}:`, error);
      
      // Handle retries
      const retryCount = this.retryAttempts.get(item.filePath) || 0;
      if (retryCount < this.MAX_RETRIES) {
        this.retryAttempts.set(item.filePath, retryCount + 1);
        
        // Re-add to front of queue with delay
        setTimeout(() => {
          this.queue.unshift(item);
          this.processQueue();
        }, 100 * (retryCount + 1)); // Exponential backoff
        
        console.log(`🔄 Retrying save (${retryCount + 1}/${this.MAX_RETRIES})`);
      } else {
        console.error(`❌ Failed to save after ${this.MAX_RETRIES} attempts: ${item.filePath}`);
        this.retryAttempts.delete(item.filePath);
        setImmediate(() => this.processQueue());
      }
    }
  }

  clear(): void {
    this.queue = [];
    this.retryAttempts.clear();
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}