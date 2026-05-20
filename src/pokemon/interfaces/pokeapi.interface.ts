/**
 * Minimal typed subset of the PokéAPI `GET /pokemon/{name}` response.
 * Only the fields consumed by this service are declared; the full API response
 * contains many additional properties.
 *
 * @see https://pokeapi.co/docs/v2#pokemon
 */

/**
 * A slim reference to a named PokéAPI resource.
 * The full resource is available at the `url` field (omitted here as unused).
 */
export interface PokeApiNamedResource {
  name: string;
}

/** A single type slot entry in a Pokémon's `types` array */
export interface PokeApiPokemonType {
  type: PokeApiNamedResource;
}

/** A single base stat entry in a Pokémon's `stats` array */
export interface PokeApiPokemonStat {
  /** The base value of this stat (before EVs, IVs, or level scaling) */
  base_stat: number;
  stat: PokeApiNamedResource;
}

/** A single ability slot entry in a Pokémon's `abilities` array */
export interface PokeApiPokemonAbility {
  ability: PokeApiNamedResource;
}

/** Sprite URLs for a Pokémon. Only fields consumed by this service are declared */
export interface PokeApiSprites {
  /** Low-resolution front-facing sprite. Used as the image fallback */
  front_default: string | null;
  /** Present for most Pokémon but absent for some older entries */
  other?: {
    /** High-resolution official artwork. Preferred image source */
    'official-artwork'?: {
      front_default: string | null;
    };
  };
}

/** Typed subset of the PokéAPI `GET /pokemon/{name}` response */
export interface PokeApiPokemon {
  /** The name for this resource */
  name: string;
  /** The height of this Pokémon in decimetres */
  height: number;
  /** The weight of this Pokémon in hectograms */
  weight: number;
  /** The base experience gained for defeating this Pokémon */
  base_experience: number;
  /** A list of details showing types this Pokémon has */
  types: PokeApiPokemonType[];
  /** A list of base stat values for this Pokémon */
  stats: PokeApiPokemonStat[];
  /** A list of abilities this Pokémon might have, including its hidden ability */
  abilities: PokeApiPokemonAbility[];
  /** A set of sprites used to depict this Pokémon in the game */
  sprites: PokeApiSprites;
}
