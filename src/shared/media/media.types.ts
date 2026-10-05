/** Metadados de um arquivo armazenado. Nunca inclui o binario. */
export interface StoredMedia {
  id: string;
  /**
   * Valor a persistir em `avatar_url` / `photo_url` / `media_url`: `s3:<chave>` no driver s3
   * (vira URL pre-assinada na resposta, ver `plugins/media-urls.ts`) ou `/media/<id>` no
   * driver database.
   */
  url: string;
  mimeType: string;
  sizeBytes: number;
  filename: string | null;
  createdAt: Date;
}

export interface MediaUploadInput {
  /** Conteudo em base64, com ou sem prefixo data URL. */
  data: string;
  /** MIME informado pelo cliente. E conferido contra o magic number do binario. */
  declaredMimeType: string;
  filename?: string | undefined;
  /** `users.id` do dono. Null para midia global (ex.: catalogo de exercicios, Fase 3.2). */
  ownerId: string | null;
}

/**
 * Contrato de armazenamento de midia. Implementado por `s3MediaStorage` (padrao) e
 * `dbMediaStorage` (testes/dev sem AWS); `MEDIA_STORAGE_DRIVER` escolhe qual `mediaStorage`
 * as features recebem.
 *
 * `upload` recebe base64 e nao `Buffer` de proposito: a validacao (tamanho, magic number)
 * e o destino do binario sao decisao da implementacao, nao de quem chama.
 *
 * O metadado sempre mora em `media_assets`; so o binario muda de lugar. Por isso nao ha
 * `getBinary` aqui: no S3 o cliente baixa direto do bucket, pela URL pre-assinada.
 */
export interface MediaService {
  upload(input: MediaUploadInput): Promise<StoredMedia>;
  getMetadata(id: string): Promise<StoredMedia | null>;
  delete(id: string): Promise<void>;
}
