import { ApiProperty } from '@nestjs/swagger';

/** Base stats for a single Pokémon as returned by PokéAPI */
export class PokemonStats {
  @ApiProperty({ description: 'Base HP (Hit Points) stat', example: 45 })
  hp: number;

  @ApiProperty({ description: 'Base Attack stat', example: 49 })
  attack: number;

  @ApiProperty({ description: 'Base Defense stat', example: 49 })
  defense: number;

  @ApiProperty({ description: 'Base Special Attack stat', example: 65 })
  'special-attack': number;

  @ApiProperty({ description: 'Base Special Defense stat', example: 65 })
  'special-defense': number;

  @ApiProperty({ description: 'Base Speed stat', example: 45 })
  speed: number;
}

/**
 * A single Pokémon member of a team, combining data from the PokéAPI
 * `/pokemon/{name}` endpoint with sprites and abilities.
 *
 * Units follow PokéAPI conventions: height in decimetres (dm), weight in hectograms (hg).
 */
export class PokemonMember {
  @ApiProperty({ description: 'Pokémon name', example: 'bulbasaur' })
  name: string;

  @ApiProperty({
    description: 'Height in decimetres (1 dm = 10 cm)',
    example: 7,
  })
  height: number;

  @ApiProperty({
    description: 'Weight in hectograms (1 hg = 100 g)',
    example: 69,
  })
  weight: number;

  @ApiProperty({
    description: 'A list of types this Pokémon has',
    example: ['grass', 'poison'],
    type: [String],
  })
  types: string[];

  @ApiProperty({
    description: 'A list of base stat values for this Pokémon',
    type: () => PokemonStats,
  })
  stats: PokemonStats;

  @ApiProperty({
    description:
      'Official artwork URL; falls back to the front sprite if unavailable',
    example:
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
    nullable: true,
  })
  image: string | null;

  @ApiProperty({
    description:
      'A list of abilities this Pokémon might have, including its hidden ability',
    example: ['overgrow', 'chlorophyll'],
    type: [String],
  })
  abilities: string[];

  @ApiProperty({
    description: 'The experience points awarded for defeating this Pokémon',
    example: 64,
  })
  base_experience: number;
}

/** Aggregate statistics computed across all Pokémon in a team */
export class TeamSummary {
  @ApiProperty({
    description: "Sum of all members' weights in hectograms",
    example: 128,
  })
  total_weight: number;

  @ApiProperty({
    description: 'Mean height in decimetres, rounded to one decimal place',
    example: 5.5,
  })
  average_height: number;

  @ApiProperty({
    description: "Sum of all members' base HP stats",
    example: 80,
  })
  total_hp: number;

  @ApiProperty({
    description: 'Count of each Pokémon type across the team',
    example: { grass: 1, poison: 1, fire: 2 },
    additionalProperties: { type: 'number' },
  })
  type_counts: Record<string, number>;
}

/** Full response body for `GET /pokemon/team` */
export class TeamResponse {
  @ApiProperty({
    description:
      'The requested Pokémon team members, in the order they were requested',
    type: () => [PokemonMember],
  })
  team: PokemonMember[];

  @ApiProperty({
    description: 'Aggregate statistics computed across all members of the team',
    type: () => TeamSummary,
  })
  summary: TeamSummary;
}
