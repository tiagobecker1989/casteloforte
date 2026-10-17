
import { Membro, Lancamento, Unidade, Departamento, Evento } from '../types';

const DB_NAME = 'IELB_ERP_DB';
const DB_VERSION = 1;

export const STORES = {
  MEMBROS: 'membros',
  LANCAMENTOS: 'lancamentos',
  UNIDADES: 'unidades',
  DEPARTAMENTOS: 'departamentos',
  EVENTOS: 'eventos'
};

export class Database {
  private db: IDBDatabase | null = null;

  async connect(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Tabela de Membros com índices de busca
        if (!db.objectStoreNames.contains(STORES.MEMBROS)) {
          const store = db.createObjectStore(STORES.MEMBROS, { keyPath: 'id' });
          store.createIndex('unidadeId', 'unidadeId', { unique: false });
          store.createIndex('nome', 'nome', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        }

        // Tabela de Lançamentos Financeiros
        if (!db.objectStoreNames.contains(STORES.LANCAMENTOS)) {
          const store = db.createObjectStore(STORES.LANCAMENTOS, { keyPath: 'id' });
          store.createIndex('unidadeId', 'unidadeId', { unique: false });
          store.createIndex('data', 'data', { unique: false });
        }

        // Outras tabelas
        [STORES.UNIDADES, STORES.DEPARTAMENTOS, STORES.EVENTOS].forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            const store = db.createObjectStore(s, { keyPath: 'id' });
            store.createIndex('unidadeId', 'unidadeId', { unique: false });
          }
        });
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string, indexName?: string, indexValue?: any): Promise<T[]> {
    const db = await this.connect();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      let request: IDBRequest;

      if (indexName && indexValue) {
        const index = store.index(indexName);
        request = index.getAll(indexValue);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName: string, data: any): Promise<void> {
    const db = await this.connect();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPaginated<T>(
    storeName: string, 
    unidadeId: string, 
    page: number, 
    limit: number, 
    search?: string
  ): Promise<{ data: T[], total: number }> {
    const db = await this.connect();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index('unidadeId');
      const range = IDBKeyRange.only(unidadeId);
      
      const results: T[] = [];
      let counter = 0;
      let total = 0;
      const start = (page - 1) * limit;

      const cursorRequest = index.openCursor(range);

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const item = cursor.value;
          
          // Filtro de busca opcional (manual no cursor para flexibilidade)
          const matchesSearch = !search || item.nome.toLowerCase().includes(search.toLowerCase());
          
          if (matchesSearch) {
            if (counter >= start && results.length < limit) {
              results.push(item);
            }
            total++;
          }
          
          counter++;
          cursor.continue();
        } else {
          resolve({ data: results, total });
        }
      };

      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  }
}

export const db = new Database();
