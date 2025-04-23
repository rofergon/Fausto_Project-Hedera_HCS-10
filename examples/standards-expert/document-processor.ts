import fs from 'fs';
import path from 'path';
import { VectorStore } from './vector-store';
import axios from 'axios';

interface GitHubCacheEntry {
  data: unknown;
  timestamp: number;
}

export interface DocumentProcessorConfig {
  /** Vector store instance */
  vectorStore: VectorStore;
  /** Path to the documentation directory (optional if using GitHub) */
  docsPath?: string;
  /** File extensions to process (default: .md, .mdx) */
  extensions?: string[];
  /** Chunk size in characters (default: 1000) */
  chunkSize?: number;
  /** Chunk overlap in characters (default: 200) */
  chunkOverlap?: number;
  /** Whether to fetch documentation from GitHub (default: false) */
  useGitHub?: boolean;
  /** GitHub repository for HCS standards (default: hashgraph-online/hcs-improvement-proposals) */
  githubRepo?: string;
  /** GitHub branch to use (default: main) */
  githubBranch?: string;
  /** Number of hours to cache GitHub content (default: 24, 0 to disable) */
  cacheTtlHours?: number;
}

export interface ProcessedDocument {
  id: string;
  content: string;
  metadata: {
    source: string;
    title?: string;
    standard?: string;
    section?: string;
    chunkIndex?: number;
    totalChunks?: number;
    fileName?: string;
  };
}

interface GitHubItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url?: string;
  url: string;
}

/**
 * DocumentProcessor class for processing and chunking documentation files
 * for storage in a vector database
 */
export class DocumentProcessor {
  private vectorStore: VectorStore;
  private docsPath: string;
  private extensions: string[];
  private chunkSize: number;
  private chunkOverlap: number;
  private useGitHub: boolean;
  private githubRepo: string;
  private githubBranch: string;
  private cacheTtlHours: number;
  private cacheDir: string;
  private githubCache: Map<string, GitHubCacheEntry> = new Map();

  constructor(config: DocumentProcessorConfig) {
    this.vectorStore = config.vectorStore;
    this.docsPath = config.docsPath || './docs';
    this.extensions = config.extensions || ['.md', '.mdx'];
    this.chunkSize = config.chunkSize || 1000;
    this.chunkOverlap = config.chunkOverlap || 200;
    this.useGitHub = config.useGitHub || false;
    this.githubRepo = config.githubRepo || 'hashgraph-online/hcs-improvement-proposals';
    this.githubBranch = config.githubBranch || 'main';
    this.cacheTtlHours = config.cacheTtlHours ?? 24;
    this.cacheDir = path.join(this.docsPath, '.cache');

    // Create cache directory if it doesn't exist
    if (this.useGitHub && this.cacheTtlHours > 0) {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      this.loadCacheFromDisk();
    }
  }

  /**
   * Process all documentation files in the specified directory or from GitHub
   */
  public async processAllDocuments(): Promise<void> {
    const processedDocs: ProcessedDocument[] = [];

    if (this.useGitHub) {
      // Process documentation from GitHub
      const docs = await this.processGitHubDocs();
      processedDocs.push(...docs);
    } else {
      // Process documentation from local directory
      const filePaths = this.getDocumentFiles(this.docsPath);
    for (const filePath of filePaths) {
      const docs = await this.processFile(filePath);
      processedDocs.push(...docs);
      }
    }

    // Store documents in vector store
    if (processedDocs.length) {
      const documents = processedDocs.map(doc => doc.content);
      const ids = processedDocs.map(doc => doc.id);
      const metadata = processedDocs.map(doc => doc.metadata);

      await this.vectorStore.addDocuments(documents, ids, metadata);
      console.log(`Added ${processedDocs.length} document chunks to vector store.`);
    }
  }

  /**
   * Load cache from disk
   */
  private loadCacheFromDisk(): void {
    try {
      const cacheFile = path.join(this.cacheDir, 'github-cache.json');
      if (fs.existsSync(cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        Object.entries(cacheData).forEach(([key, value]) => {
          this.githubCache.set(key, value as GitHubCacheEntry);
        });
        console.log(`Loaded ${this.githubCache.size} entries from GitHub cache.`);
      }
    } catch (error) {
      console.warn('Failed to load GitHub cache from disk:', error);
    }
  }

  /**
   * Save cache to disk
   */
  private saveCacheToDisk(): void {
    try {
      const cacheData: Record<string, GitHubCacheEntry> = {};
      this.githubCache.forEach((value, key) => {
        cacheData[key] = value;
      });

      const cacheFile = path.join(this.cacheDir, 'github-cache.json');
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('Failed to save GitHub cache to disk:', error);
    }
  }

  /**
   * Process documentation from GitHub repository
   */
  private async processGitHubDocs(): Promise<ProcessedDocument[]> {
    console.log(`Fetching documentation from GitHub: ${this.githubRepo}`);
    const processedDocs: ProcessedDocument[] = [];

    try {
      // Fetch docs directory contents
      const docsUrl = `https://api.github.com/repos/${this.githubRepo}/contents/docs?ref=${this.githubBranch}`;
      const response = await this.fetchWithCache(docsUrl);

      if (!Array.isArray(response)) {
        console.error('Unexpected response format from GitHub API');
        return processedDocs;
      }

      // Process each file and subdirectory
      for (const item of response as GitHubItem[]) {
        if (item.type === 'file') {
          // Check file extension
          const ext = path.extname(item.name);
          if (this.extensions.includes(ext) && item.download_url) {
            // Process the file
            const fileContent = await this.fetchGitHubFile(item.download_url);
            if (fileContent) {
              const docs = this.processGitHubFile(fileContent, item.name, item.path);
              processedDocs.push(...docs);
            }
          }
        } else if (item.type === 'dir') {
          // Recursively process directories
          const dirItems = await this.fetchWithCache(item.url) as GitHubItem[];
          for (const dirItem of dirItems) {
            if (dirItem.type === 'file') {
              const ext = path.extname(dirItem.name);
              if (this.extensions.includes(ext) && dirItem.download_url) {
                const fileContent = await this.fetchGitHubFile(dirItem.download_url);
                if (fileContent) {
                  const docs = this.processGitHubFile(fileContent, dirItem.name, dirItem.path);
                  processedDocs.push(...docs);
                }
              }
            }
          }
        }
      }

      console.log(`Processed ${processedDocs.length} document chunks from GitHub.`);

      // Save the cache after processing
      if (this.cacheTtlHours > 0) {
        this.saveCacheToDisk();
      }

      return processedDocs;
    } catch (error) {
      console.error(`Error fetching documents from GitHub: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch with cache
   */
  private async fetchWithCache(url: string): Promise<unknown> {
    // If caching is disabled, fetch directly
    if (this.cacheTtlHours <= 0) {
      return axios.get(url).then(response => response.data);
    }

    // Check cache
    const cached = this.githubCache.get(url);
    const now = Date.now();
    const cacheTtlMs = this.cacheTtlHours * 60 * 60 * 1000;

    if (cached && (now - cached.timestamp) < cacheTtlMs) {
      return cached.data;
    }

    // Fetch and update cache
    try {
      const response = await axios.get(url);
      this.githubCache.set(url, {
        data: response.data,
        timestamp: now
      });
      return response.data;
    } catch (error) {
      // If we got rate limited, sleep and retry once
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        console.warn('GitHub API rate limit hit, waiting 5 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        const response = await axios.get(url);
        this.githubCache.set(url, {
          data: response.data,
          timestamp: now
        });
        return response.data;
      }

      throw error;
    }
  }

  /**
   * Fetch a GitHub directory contents
   */
  private async fetchGitHubDirectory(url: string): Promise<GitHubItem[]> {
    try {
      return await this.fetchWithCache(url) as GitHubItem[];
    } catch (error) {
      console.error(`Error fetching GitHub directory: ${error}`);
      return [];
    }
  }

  /**
   * Fetch a file from GitHub
   */
  private async fetchGitHubFile(url: string): Promise<string | null> {
    try {
      return await this.fetchWithCache(url) as string;
    } catch (error) {
      console.error(`Error fetching GitHub file: ${error}`);
      return null;
    }
  }

  /**
   * Process a file from GitHub
   */
  private processGitHubFile(content: string, fileName: string, filePath: string): ProcessedDocument[] {
    // Extract metadata
    const metadata = this.extractMetadata(content, fileName, filePath);

    // Split content into chunks
    const chunks = this.splitIntoChunks(content);

    return chunks.map((chunk, index) => ({
      id: `github-${filePath}-chunk-${index}`,
      content: chunk,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
        source: `github/${filePath}`
      }
    }));
  }

  /**
   * Get all documentation files in a directory
   */
  private getDocumentFiles(dirPath: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        this.getDocumentFiles(filePath, fileList);
      } else {
        const ext = path.extname(file);
        if (this.extensions.includes(ext)) {
          fileList.push(filePath);
        }
      }
    }

    return fileList;
  }

  /**
   * Process a single documentation file
   */
  private async processFile(filePath: string): Promise<ProcessedDocument[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const relativePath = path.relative(this.docsPath, filePath);

    // Extract metadata
    const metadata = this.extractMetadata(content, fileName, relativePath);
    // Split content into chunks
    const chunks = this.splitIntoChunks(content);
    return chunks.map((chunk, index) => ({
      id: `${relativePath}-chunk-${index}`,
      content: chunk,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
      }
    }));
  }

  /**
   * Extract metadata from file content
   */
  private extractMetadata(content: string, fileName: string, relativePath: string): {
    source: string;
    fileName: string;
    title?: string;
    standard?: string;
  } {
    interface DocMetadata {
      source: string;
      fileName: string;
      title?: string;
      standard?: string;
    }

    const metadata: DocMetadata = {
      source: relativePath,
      fileName
    };

    // Try to extract the title from markdown
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      metadata.title = titleMatch[1].trim();
    }

    // Try to determine if this is a standards document (HCS-X)
    const standardMatch = fileName.match(/^hcs-(\d+)/i) || content.match(/HCS-(\d+)/i);
    if (standardMatch) {
      metadata.standard = `HCS-${standardMatch[1]}`;
    }

    return metadata;
  }

  /**
   * Split content into chunks with overlap
   */
  private splitIntoChunks(content: string): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < content.length) {
      const endIndex = Math.min(startIndex + this.chunkSize, content.length);
      chunks.push(content.substring(startIndex, endIndex));
      startIndex = endIndex - this.chunkOverlap;
      // If we're near the end, don't create a tiny chunk
      if (endIndex + this.chunkSize - this.chunkOverlap > content.length) {
        break;
      }
    }

    return chunks;
  }
} 