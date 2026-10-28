export const AVATAR_STYLES = [
  { id: 'critters', name: 'Critters' },
  { id: 'fun-emoji', name: 'Fun Emoji' },
  { id: 'clay', name: 'Clay' },
  { id: 'micah', name: 'Micah' },
];

const loaders = {
  critters: () => import('@dicebear/styles/critters.json'),
  'fun-emoji': () => import('@dicebear/styles/fun-emoji.json'),
  clay: () => import('@dicebear/styles/clay.json'),
  micah: () => import('@dicebear/styles/micah.json'),
};
const avatarCache = new Map();

export async function createAvatarDataUri(styleId, seed) {
  const selectedStyle = loaders[styleId] ? styleId : 'critters';
  const selectedSeed = String(seed || 'dsavation-member');
  const key = `${selectedStyle}:${selectedSeed}`;
  if (avatarCache.has(key)) return avatarCache.get(key);
  const generated = Promise.all([import('@dicebear/core'), loaders[selectedStyle]()]).then(([core, module]) =>
    new core.Avatar(new core.Style(module.default), { seed: selectedSeed }).toDataUri());
  avatarCache.set(key, generated);
  try {
    return await generated;
  } catch (error) {
    avatarCache.delete(key);
    throw error;
  }
}

export function createAvatarSeeds(count = 8) {
  return Array.from({ length: count }, () => {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `avatar-${random.replaceAll('-', '').slice(0, 20)}`;
  });
}
