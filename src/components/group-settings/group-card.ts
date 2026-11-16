import { initials } from '../../lib/format';
import { renderPersonCard } from '../person-card/person-card';

export interface GroupCardData {
  name: string;
  description?: string | undefined;
  accentId?: string | undefined;
  photo?: string | undefined;
  banner?: string | undefined;
  memberCount: number;
}

/**
 * O CARTÃO DO GRUPO (etapa 3a): a mesma peça do cartão de pessoa — faixa na
 * cor do grupo (ou o banner), foto quadrada, nome, quantos membros e a
 * descrição. Aparece no topo da aba "Agora" e na prévia das Configurações
 * do grupo.
 */
export function renderGroupCard(data: GroupCardData, extra: HTMLElement[] = []): HTMLElement {
  const card = renderPersonCard(
    {
      displayName: data.name,
      initials: initials(data.name),
      subtitle: data.memberCount === 1 ? '1 membro' : `${data.memberCount} membros`,
      bio: data.description,
      accentId: data.accentId,
      photo: data.photo === '' ? undefined : data.photo,
      banner: data.banner === '' ? undefined : data.banner,
    },
    extra,
    'person-card__avatar avatar--quadrado',
  );
  card.classList.add('group-card');
  return card;
}
