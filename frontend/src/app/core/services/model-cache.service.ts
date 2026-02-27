import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { openDB, IDBPDatabase } from 'idb';
import * as tf from '@tensorflow/tfjs';

const DB_NAME = 'burnout-model-cache';
const DB_VERSION = 1;
const MODEL_STORE = 'model';
const CONTEXT_STORE = 'context';
const MODEL_JSON_KEY = 'model.json';
const WEIGHTS_KEY = 'weights.bin';
const CONTEXT_KEY = 'context.json';
const MODEL_BASE_URL = '/model';

export interface ModelContext {
  mins: number[];
  maxs: number[];
  numFeatures: number;
}

@Injectable({ providedIn: 'root' })
export class ModelCacheService {
  private readonly http = inject(HttpClient);
  private db?: IDBPDatabase;
  private _model?: tf.LayersModel;
  private _context?: ModelContext;

  get model(): tf.LayersModel | undefined {
    return this._model;
  }

  get context(): ModelContext | undefined {
    return this._context;
  }

  /** Ensures TF.js model is loaded (from IndexedDB or downloaded from server). */
  async ensureModelLoaded(): Promise<boolean> {
    if (this._model && this._context) return true;

    try {
      await this.openDb();
      const cached = await this.loadFromIndexedDB();
      if (cached) {
        console.log('[ModelCache] Model loaded from IndexedDB.');
        return true;
      }

      // Download from server wwwroot
      console.log('[ModelCache] Downloading model from server...');
      const [modelJson, weightsBlob, contextData] = await Promise.all([
        firstValueFrom(this.http.get(`${MODEL_BASE_URL}/model.json`)),
        firstValueFrom(this.http.get(`${MODEL_BASE_URL}/weights.bin`, { responseType: 'arraybuffer' })),
        firstValueFrom(this.http.get<ModelContext>(`${MODEL_BASE_URL}/context.json`)),
      ]);

      await this.saveToIndexedDB(modelJson, weightsBlob as ArrayBuffer, contextData);
      const loaded = await this.loadFromIndexedDB();
      if (loaded) {
        console.log('[ModelCache] Model downloaded and cached in IndexedDB.');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[ModelCache] Failed to load model:', err);
      return false;
    }
  }

  /** Run inference on a single feature vector. Returns burnout score [0–100]. */
  async predict(features: number[]): Promise<number | null> {
    if (!this._model || !this._context) return null;
    const normalized = this.normalizeWithContext(features, this._context);
    const inputTensor = tf.tensor2d([normalized]);
    const prediction = this._model.predict(inputTensor) as tf.Tensor;
    const raw = (await prediction.data())[0];
    inputTensor.dispose();
    prediction.dispose();
    return Math.min(100, Math.max(0, parseFloat((raw * 100).toFixed(2))));
  }

  /** Clears cached model from IndexedDB (useful when retraining). */
  async clearCache(): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction([MODEL_STORE, CONTEXT_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(MODEL_STORE).clear(),
      tx.objectStore(CONTEXT_STORE).clear(),
      tx.done,
    ]);
    this._model?.dispose();
    this._model = undefined;
    this._context = undefined;
    console.log('[ModelCache] Cache cleared.');
  }

  /** Saves a newly trained model to IndexedDB. */
  async saveTrainedModel(model: tf.LayersModel, context: ModelContext): Promise<void> {
    await this.clearCache();
    const db = await this.openDb();

    // Serialize model via TF.js io handler
    await model.save(
      tf.io.withSaveHandler(async (artifacts) => {
        const weights = Array.isArray(artifacts.weightData)
          ? mergeArrayBuffers(artifacts.weightData as ArrayBuffer[])
          : (artifacts.weightData as ArrayBuffer);

        // Build a model.json-compatible structure so loadFromIndexedDB can read it
        const modelJson = {
          modelTopology: artifacts.modelTopology,
          weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs ?? [] }],
          format: 'layers-model',
        };

        const tx = db.transaction([MODEL_STORE, CONTEXT_STORE], 'readwrite');
        await Promise.all([
          tx.objectStore(MODEL_STORE).put(JSON.stringify(modelJson), MODEL_JSON_KEY),
          tx.objectStore(MODEL_STORE).put(weights, WEIGHTS_KEY),
          tx.objectStore(CONTEXT_STORE).put(JSON.stringify(context), CONTEXT_KEY),
          tx.done,
        ]);
        return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
      })
    );

    this._model = model;
    this._context = context;
    console.log('[ModelCache] Trained model saved to IndexedDB.');
  }

  private async openDb(): Promise<IDBPDatabase> {
    if (this.db) return this.db;
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(MODEL_STORE)) db.createObjectStore(MODEL_STORE);
        if (!db.objectStoreNames.contains(CONTEXT_STORE)) db.createObjectStore(CONTEXT_STORE);
      },
    });
    return this.db;
  }

  private async loadFromIndexedDB(): Promise<boolean> {
    try {
      const db = await this.openDb();
      const tx = db.transaction([MODEL_STORE, CONTEXT_STORE], 'readonly');
      const [modelJsonStr, weightsBuffer, contextStr] = await Promise.all([
        tx.objectStore(MODEL_STORE).get(MODEL_JSON_KEY),
        tx.objectStore(MODEL_STORE).get(WEIGHTS_KEY),
        tx.objectStore(CONTEXT_STORE).get(CONTEXT_KEY),
      ]);

      if (!modelJsonStr || !weightsBuffer || !contextStr) return false;

      // Parse model.json to extract topology and weight specs
      const modelJson = JSON.parse(modelJsonStr);
      const weightSpecs = modelJson.weightsManifest?.[0]?.weights ?? [];
      const modelTopology = modelJson.modelTopology ?? modelJson;
      const context: ModelContext = JSON.parse(contextStr);

      const model = await tf.loadLayersModel(
        tf.io.fromMemory({ modelTopology, weightSpecs, weightData: weightsBuffer as ArrayBuffer })
      );

      this._model = model;
      this._context = context;
      return true;
    } catch {
      return false;
    }
  }

  private async saveToIndexedDB(
    modelJson: unknown,
    weightsBuffer: ArrayBuffer,
    context: ModelContext
  ): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction([MODEL_STORE, CONTEXT_STORE], 'readwrite');
    await Promise.all([
      tx.objectStore(MODEL_STORE).put(JSON.stringify(modelJson), MODEL_JSON_KEY),
      tx.objectStore(MODEL_STORE).put(weightsBuffer, WEIGHTS_KEY),
      tx.objectStore(CONTEXT_STORE).put(JSON.stringify(context), CONTEXT_KEY),
      tx.done,
    ]);
  }

  private normalizeWithContext(features: number[], context: ModelContext): number[] {
    return features.map((v, i) => {
      const range = context.maxs[i] - context.mins[i];
      return range > 0 ? Math.min(1, Math.max(0, (v - context.mins[i]) / range)) : 0;
    });
  }
}

function mergeArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    merged.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return merged.buffer;
}
