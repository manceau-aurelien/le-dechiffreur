// Assemble le Port et la Ville : les moteurs de leçon et de révision ne voient qu'un seul contenu.
import type { City, Tier, TierNode } from './schema';

export function districtNodes(city: City): TierNode[] {
  return city.districts.flatMap((d) => d.nodes.map((n) => ({ ...n, districtId: d.id })));
}

/** Le Port garde sa place ; les nœuds des quartiers le suivent et portent le nom de leur quartier. */
export function mergeTier(port: Tier, city: City): Tier {
  return { ...port, nodes: [...port.nodes, ...districtNodes(city)] };
}
