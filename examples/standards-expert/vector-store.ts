import path from 'path';
import fs from 'fs';
import { ChromaClient, Collection, OpenAIEmbeddingFunction } from 'chromadb';

export interface VectorStoreConfig {
  /** Path to the vector store directory */
  path: string;
  /** Namespace for the collection */
  namespace: string;
  /** OpenAI API key for embeddings (optional if using another embedding method) */
  openAiApiKey?: string;
}

export interface SearchResult {
  id: string;
  document: string;
  metadata?: Record<string, unknown>;
  score: number;
}

/**
 * VectorStore class for storing and retrieving document embeddings
 * Uses ChromaDB for vector storage and similarity search
 */
export class VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddingFunction: OpenAIEmbeddingFunction;
  private config: VectorStoreConfig;
  private initialized = false;
  private documents: Map<string, {document: string, metadata: Record<string, unknown>}> = new Map();

  constructor(config: VectorStoreConfig) {
    this.config = config;
    
    // Ensure the data directory exists
    const dataPath = path.resolve(config.path);
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    // Use in-memory client with no path
    this.client = new ChromaClient();

    this.embeddingFunction = new OpenAIEmbeddingFunction({
      openai_api_key: this.config.openAiApiKey || process.env.OPENAI_API_KEY || '',
      openai_model: 'text-embedding-ada-002'
    });
  }

  /**
   * Initialize the vector store
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Get or create collection using proper in-memory configuration
      console.log(`Initializing in-memory Chroma collection: ${this.config.namespace}-collection`);
      this.client = new ChromaClient({ path: '' }); // Empty path for in-memory

      this.collection = await this.client.getOrCreateCollection({
        name: `${this.config.namespace}-collection`,
        embeddingFunction: this.embeddingFunction,
        metadata: {
          description: 'Hedera Standards knowledge base'
        }
      });

      this.initialized = true;
      console.log(`Vector store initialized with collection: ${this.config.namespace}-collection`);
    } catch (error) {
      console.error("Error initializing ChromaDB:", error);
      // Fall back to simple in-memory storage
      console.log("Falling back to simple in-memory document storage (no embeddings)");
      this.initialized = true;
    }
  }

  /**
   * Add documents to the vector store
   * @param documents Array of documents to add
   * @param ids Optional array of IDs for the documents
   * @param metadata Optional array of metadata for the documents
   */
  public async addDocuments(
    documents: string[],
    ids?: string[],
    metadata?: Record<string, unknown>[]
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!documents.length) {
      return;
    }

    // Generate IDs if not provided
    const documentIds = ids || documents.map((_, i) => `doc-${Date.now()}-${i}`);
    
    // Generate metadata if not provided
    const documentMetadata = metadata || documents.map(() => ({}));

    try {
      // Try using ChromaDB collection
      if (this.collection) {
    await this.collection.add({
      ids: documentIds,
      documents,
          metadatas: documentMetadata
    });
      }
    } catch (error) {
      console.error("Error adding documents to ChromaDB, using in-memory fallback:", error);
    }

    // Store in our simple map as fallback
    for (let i = 0; i < documents.length; i++) {
      this.documents.set(documentIds[i], {
        document: documents[i],
        metadata: documentMetadata[i]
      });
    }
    
    console.log(`Added ${documents.length} documents to vector store`);
  }

  /**
   * Search for similar documents to a query
   * @param query Query string
   * @param limit Maximum number of results to return (default: 5)
   * @returns Array of search results
   */
  public async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Try using ChromaDB collection for semantic search
      if (this.collection) {
        try {
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: limit,
            include: ["documents", "metadatas", "distances"]
    });

          if (results.ids.length && results.ids[0].length) {
    const searchResults: SearchResult[] = [];
    
    for (let i = 0; i < results.ids[0].length; i++) {
      const id = results.ids[0][i];
      const document = results.documents?.[0]?.[i] as string;
              const metadata = results.metadatas?.[0]?.[i] as Record<string, unknown>;
      const distance = results.distances?.[0]?.[i] as number;
      
      // Convert distance to similarity score (1.0 is perfect match, 0.0 is no match)
      // Distance is typically 0 (perfect match) to 2 (opposite vectors)
      const score = 1 - distance / 2;
      
      searchResults.push({
        id,
        document,
        metadata,
                score
      });
    }
            return searchResults;
          }
        } catch (error) {
          console.error("Error querying ChromaDB, falling back to keyword search:", error);
        }
      }
    } catch (error) {
      console.warn("Using fallback search method:", error);
    }

    // Fallback to simple keyword search using our in-memory map
    console.log("Using simple keyword search (ChromaDB not available)");
    const results: SearchResult[] = [];
    const lowercaseQuery = query.toLowerCase();
    
    for (const [id, data] of this.documents.entries()) {
      // Simple keyword match - could be improved with more sophisticated text matching
      if (data.document.toLowerCase().includes(lowercaseQuery)) {
        results.push({
          id,
          document: data.document,
          metadata: data.metadata,
          score: 0.5 // Default score for keyword matches
        });
      }
    }
    
    return results.slice(0, limit);
  }

  /**
   * Close the vector store
   */
  public async close(): Promise<void> {
    this.collection = null;
    this.initialized = false;
    this.documents.clear();
  }

  /**
   * Delete all documents from the vector store
   */
  public async deleteAll(): Promise<void> {
    if (this.collection) {
      try {
    await this.collection.delete();
    
    // Recreate the collection
    this.collection = await this.client.getOrCreateCollection({
      name: `${this.config.namespace}-collection`,
      embeddingFunction: this.embeddingFunction,
      metadata: {
            description: 'Hedera Standards knowledge base'
          }
    });
      } catch (error) {
        console.error("Error deleting documents from ChromaDB:", error);
      }
    }
    
    // Clear our in-memory map
    this.documents.clear();
  }
} 