import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { AxiosError } from 'axios';
import {
  PokeApiPokemon,
  PokeApiPokemonStat,
} from './interfaces/pokeapi.interface';
import {
  PokemonMember,
  PokemonStats,
  TeamResponse,
  TeamSummary,
} from './dto/team-response.dto';

/** Base URL for the PokéAPI */
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

/** Maximum number of retry attempts for transient upstream errors */
const RETRY_COUNT = 3;

/**
 * Base delay in milliseconds between retries.
 * Multiplied by the attempt number for linear backoff:
 * attempt 1 → 500 ms, attempt 2 → 1000 ms, attempt 3 → 1500 ms.
 */
const RETRY_BASE_DELAY_MS = 500;

@Injectable()
export class PokemonService {
  private readonly logger = new Logger(PokemonService.name);

  constructor(
    private readonly http: HttpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Fetches data for each Pokémon in parallel and computes aggregate team statistics.
   *
   * Duplicate names are deduplicated before fetching so each species is requested
   * at most once (one cache lookup / one PokéAPI call), then the full team — including
   * repeated entries — is reassembled from an in-memory map. Requests are made
   * concurrently so latency is bounded by the slowest single fetch, not the sum.
   *
   * @param names - Lowercase Pokémon names, pre-validated by the controller (1–6 entries).
   */
  async buildTeam(names: string[]): Promise<TeamResponse> {
    this.logger.debug(`Building team ${names.join(', ')}`);
    const memberMap = new Map(
      await Promise.all(
        [...new Set(names)].map(
          async (name) => [name, await this.fetchPokemon(name)] as const,
        ),
      ),
    );
    const team = names.map((name) => memberMap.get(name)!);
    const summary = this.computeTeamSummary(team);
    return { team, summary };
  }

  /**
   * Returns processed data for a single Pokémon, serving from the Redis cache
   * when available and writing through on a cache miss.
   *
   * Cache keys use the `pokemon:` namespace to avoid collisions with other
   * potential consumers sharing the same Redis instance.
   *
   * @param name - Lowercase Pokémon name or Pokédex ID string.
   * @throws {NotFoundException} When PokéAPI returns 404 (unknown Pokémon name).
   * @throws {BadGatewayException} On any other upstream error after all retries are exhausted.
   */
  async fetchPokemon(name: string): Promise<PokemonMember> {
    this.logger.debug(`Fetching data for ${name}`);

    // Return from cache if present
    const cacheKey = `pokemon:${name}`;
    const cached = await this.cacheManager.get<PokemonMember>(cacheKey);
    if (cached) {
      this.logger.debug(
        `Serving data for ${name} from cache: ${JSON.stringify(cached)}`,
      );
      return cached;
    }

    // Retrieve raw data from API
    const raw = await this.fetchFromPokeApi(name);
    // Map raw data to the shape we expose to clients
    const pokemon = this.mapPokemon(raw);

    // Always write to cache to populate missing entries and refresh stale data
    this.logger.debug(
      `Writing data for ${name} to cache: ${JSON.stringify(pokemon)}`,
    );
    await this.cacheManager.set(cacheKey, pokemon);
    return pokemon;
  }

  /**
   * Fetches raw Pokémon data from PokéAPI with up to {@link RETRY_COUNT} retries
   * on transient errors (5xx and network failures) using linear backoff.
   * Client errors (4xx) are not retried.
   *
   * @param name - Lowercase Pokémon name or Pokédex ID string.
   * @throws {NotFoundException} On a 404 response from PokéAPI.
   * @throws {BadGatewayException} On any other upstream error after retries are exhausted.
   */
  private async fetchFromPokeApi(name: string): Promise<PokeApiPokemon> {
    const url = `${POKEAPI_BASE}/pokemon/${name}`;
    this.logger.debug(`Fetching data for ${name} from ${url}`);

    for (let attempt = 1; attempt <= RETRY_COUNT + 1; attempt++) {
      try {
        const { data } = await this.http.axiosRef.get<PokeApiPokemon>(url);
        this.logger.debug(`Successfully fetched data for ${name} from ${url}`);
        return data;
      } catch (err) {
        const axiosErr = err as AxiosError;
        if (axiosErr.response?.status === 404) {
          const msg = `Pokemon not found: "${name}"`;
          this.logger.error(msg);
          throw new NotFoundException(msg);
        }
        // 4xx are not retried
        if (axiosErr.response && axiosErr.response.status < 500) {
          throw new BadGatewayException('PokeAPI is unavailable');
        }
        // 5xx or network error are retried up to the limit
        if (attempt <= RETRY_COUNT) {
          this.logger.debug(
            `Retrying data fetch for ${name} from ${url} (attempt ${attempt} of ${RETRY_COUNT})`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt),
          );
        }
      }
    }
    this.logger.error(
      `PokeAPI unavailable for "${name}" after ${RETRY_COUNT} retries`,
    );
    throw new BadGatewayException('PokeAPI is unavailable');
  }

  /**
   * Transforms a raw PokéAPI response into the internal `PokemonMember` shape,
   * selecting and renaming only the fields this service exposes.
   */
  private mapPokemon(raw: PokeApiPokemon): PokemonMember {
    const { name, height, weight, sprites, base_experience } = raw;
    this.logger.debug(`Mapping raw data for ${name}`);

    const types = raw.types.map((t) => t.type.name);
    const abilities = raw.abilities.map((a) => a.ability.name);

    const stats = this.mapPokemonStats(raw.stats);

    // Official artwork is higher-resolution; fall back to standard front sprite when missing in older Pokémon
    const image =
      sprites.other?.['official-artwork']?.front_default ??
      sprites.front_default;

    return {
      name,
      height,
      weight,
      types,
      stats,
      image,
      abilities,
      base_experience,
    };
  }

  /** Maps raw PokéAPI stat entries into the typed {@link PokemonStats} shape */
  private mapPokemonStats(raw: PokeApiPokemonStat[]): PokemonStats {
    const statsMap = new Map(
      raw.map(({ stat, base_stat }) => [stat.name, base_stat]),
    );
    // Extract only the stats we care about, defaulting to 0 if any are missing
    const keys: (keyof PokemonStats)[] = [
      'hp',
      'attack',
      'defense',
      'special-attack',
      'special-defense',
      'speed',
    ];
    return Object.fromEntries(
      keys.map((k) => [k, statsMap.get(k) ?? 0]),
    ) as unknown as PokemonStats;
  }

  /** Derives aggregate team statistics from the fully assembled member list */
  private computeTeamSummary(team: PokemonMember[]): TeamSummary {
    this.logger.debug(
      `Computing team summary for members: ${team.map((t) => t.name).join(', ')}`,
    );

    let total_weight = 0;
    let total_height = 0;
    let total_hp = 0;
    const type_counts: Record<string, number> = {};

    // Single pass to compute all aggregates efficiently in O(n) time
    for (const { weight, height, stats, types } of team) {
      total_weight += weight;
      total_height += height;
      total_hp += stats.hp;
      for (const type of types) {
        type_counts[type] = (type_counts[type] ?? 0) + 1;
      }
    }

    // Multiply by 10, round, and divide for value rounded to 1dp without floating-point drift
    const average_height = Math.round((total_height / team.length) * 10) / 10;

    return { total_weight, average_height, total_hp, type_counts };
  }
}
