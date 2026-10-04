import { dbMediaStorage } from '../../shared/media/index.js';
import type { MediaUpload } from './admin.schemas.js';

/**
 * Midia do catalogo (imagem de exercicio, icone de conquista) e global: `ownerId` null, lida
 * por qualquer usuario autenticado em `GET /media/:id`. O upload roda fora da transacao do
 * audit log — o binario vai para o banco antes; se a mutacao falhar depois, sobra um asset
 * orfao (mesmo descope de limpeza das fotos de sessao/atividade).
 */
export async function uploadCatalogMedia(media: MediaUpload): Promise<string> {
  const stored = await dbMediaStorage.upload({
    data: media.data,
    declaredMimeType: media.mimeType,
    filename: media.filename,
    ownerId: null,
  });

  return stored.url;
}
