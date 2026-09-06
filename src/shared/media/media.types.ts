/** Metadados de um arquivo armazenado. Nunca inclui o binario. */
export interface StoredMedia {
  id: string;
  /** URL pronta para persistir em `avatar_url` / `photo_url` / `media_url`. */
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
 * Contrato de armazenamento de midia.
 *
 * `upload` recebe base64 e nao `Buffer` de proposito: uma implementacao futura sobre S3/R2
 * precisa decidir sozinha sobre streaming, resize e conversao de formato. Se a interface
 * expusesse `Buffer`, essas decisoes vazariam para quem chama.
 *
 * `getMetadata` e separado de `getBinary` porque a linha do Postgres carrega ate 5 MB em
 * `bytea`: listar midia nunca deve trazer o binario junto. No backend S3 a separacao e
 * ainda mais evidente (metadado no banco, binario no bucket).
 */
export interface MediaService {
  upload(input: MediaUploadInput): Promise<StoredMedia>;
  getMetadata(id: string): Promise<StoredMedia | null>;
  getBinary(id: string): Promise<{ metadata: StoredMedia; buffer: Buffer } | null>;
  delete(id: string): Promise<void>;
}
