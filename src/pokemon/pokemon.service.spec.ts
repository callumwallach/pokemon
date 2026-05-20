import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { PokemonService } from './pokemon.service';
import { PokeApiPokemon } from './interfaces/pokeapi.interface';

function makeRaw(overrides: Partial<PokeApiPokemon> = {}): PokeApiPokemon {
  return {
    name: 'pikachu',
    height: 4,
    weight: 60,
    base_experience: 112,
    types: [{ type: { name: 'electric' } }],
    stats: [
      { base_stat: 35, stat: { name: 'hp' } },
      { base_stat: 55, stat: { name: 'attack' } },
      { base_stat: 40, stat: { name: 'defense' } },
      { base_stat: 50, stat: { name: 'special-attack' } },
      { base_stat: 50, stat: { name: 'special-defense' } },
      { base_stat: 90, stat: { name: 'speed' } },
    ],
    abilities: [
      { ability: { name: 'static' } },
      { ability: { name: 'lightning-rod' } },
    ],
    sprites: {
      front_default: 'http://example.com/pikachu.png',
      other: {
        'official-artwork': {
          front_default: 'http://example.com/pikachu-art.png',
        },
      },
    },
    ...overrides,
  };
}

function axiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

function axiosError(status: number): AxiosError {
  const err = new AxiosError('error', undefined, undefined, undefined, {
    status,
    statusText: '',
    data: null,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
  return err;
}

describe('PokemonService', () => {
  let service: PokemonService;
  let http: { axiosRef: { get: jest.Mock } };
  let cache: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    http = { axiosRef: { get: jest.fn() } };
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PokemonService,
        { provide: HttpService, useValue: http },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();
    service = module.get(PokemonService);
  });

  describe('fetchPokemon — cache behaviour', () => {
    it('returns cached value without calling the API', async () => {
      const cached = {
        name: 'pikachu',
        height: 4,
        weight: 60,
        types: ['electric'],
        stats: {
          hp: 35,
          attack: 55,
          defense: 40,
          'special-attack': 50,
          'special-defense': 50,
          speed: 90,
        },
        image: null,
        abilities: ['static'],
        base_experience: 112,
      };
      cache.get.mockResolvedValue(cached);

      const result = await service.fetchPokemon('pikachu');

      expect(result).toBe(cached);
      expect(http.axiosRef.get).not.toHaveBeenCalled();
    });

    it('checks the cache with the correct key', async () => {
      http.axiosRef.get.mockResolvedValue(axiosResponse(makeRaw()));

      await service.fetchPokemon('pikachu');

      expect(cache.get).toHaveBeenCalledWith('pokemon:pikachu');
    });

    it('stores the fetched result in the cache on a cache miss', async () => {
      http.axiosRef.get.mockResolvedValue(axiosResponse(makeRaw()));

      const result = await service.fetchPokemon('pikachu');

      expect(cache.set).toHaveBeenCalledWith('pokemon:pikachu', result);
    });

    it('does not write to the cache on a 404', async () => {
      http.axiosRef.get.mockRejectedValue(axiosError(404));

      await expect(service.fetchPokemon('notapokemon')).rejects.toThrow(
        NotFoundException,
      );
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('propagates a cache write failure without masking it as a PokeAPI error', async () => {
      http.axiosRef.get.mockResolvedValue(axiosResponse(makeRaw()));
      cache.set.mockRejectedValueOnce(new Error('Redis connection refused'));

      await expect(service.fetchPokemon('pikachu')).rejects.toThrow(
        'Redis connection refused',
      );
    });
  });

  describe('fetchPokemon — API mapping', () => {
    it('maps raw API response to PokemonMember', async () => {
      http.axiosRef.get.mockResolvedValue(axiosResponse(makeRaw()));
      const result = await service.fetchPokemon('pikachu');

      expect(result.name).toBe('pikachu');
      expect(result.height).toBe(4);
      expect(result.weight).toBe(60);
      expect(result.types).toEqual(['electric']);
      expect(result.stats.hp).toBe(35);
      expect(result.stats.attack).toBe(55);
      expect(result.stats.defense).toBe(40);
      expect(result.stats['special-attack']).toBe(50);
      expect(result.stats['special-defense']).toBe(50);
      expect(result.stats.speed).toBe(90);
      expect(result.abilities).toEqual(['static', 'lightning-rod']);
      expect(result.base_experience).toBe(112);
    });

    it('uses official-artwork image when available', async () => {
      http.axiosRef.get.mockResolvedValue(axiosResponse(makeRaw()));
      const result = await service.fetchPokemon('pikachu');
      expect(result.image).toBe('http://example.com/pikachu-art.png');
    });

    it('falls back to front_default when official-artwork is null', async () => {
      http.axiosRef.get.mockResolvedValue(
        axiosResponse(
          makeRaw({
            sprites: {
              front_default: 'http://example.com/pikachu.png',
              other: { 'official-artwork': { front_default: null } },
            },
          }),
        ),
      );
      const result = await service.fetchPokemon('pikachu');
      expect(result.image).toBe('http://example.com/pikachu.png');
    });

    it('falls back to front_default when sprites.other is absent', async () => {
      http.axiosRef.get.mockResolvedValue(
        axiosResponse(
          makeRaw({
            sprites: { front_default: 'http://example.com/pikachu.png' },
          }),
        ),
      );
      const result = await service.fetchPokemon('pikachu');
      expect(result.image).toBe('http://example.com/pikachu.png');
    });

    it('returns null image when both sprite sources are null', async () => {
      http.axiosRef.get.mockResolvedValue(
        axiosResponse(makeRaw({ sprites: { front_default: null } })),
      );
      const result = await service.fetchPokemon('pikachu');
      expect(result.image).toBeNull();
    });

    it('defaults a missing stat to 0', async () => {
      http.axiosRef.get.mockResolvedValue(
        axiosResponse(
          makeRaw({
            stats: [
              // 'hp' intentionally omitted
              { base_stat: 55, stat: { name: 'attack' } },
              { base_stat: 40, stat: { name: 'defense' } },
              { base_stat: 50, stat: { name: 'special-attack' } },
              { base_stat: 50, stat: { name: 'special-defense' } },
              { base_stat: 90, stat: { name: 'speed' } },
            ],
          }),
        ),
      );
      const result = await service.fetchPokemon('pikachu');
      expect(result.stats.hp).toBe(0);
    });
  });

  describe('fetchPokemon — retry behaviour', () => {
    beforeEach(() => {
      // Make setTimeout fire immediately so retries don't incur real delays.
      jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((fn: TimerHandler) => {
          if (typeof fn === 'function') (fn as () => void)();
          return 0 as unknown as NodeJS.Timeout;
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('retries on 5xx errors before succeeding', async () => {
      http.axiosRef.get
        .mockRejectedValueOnce(axiosError(500))
        .mockRejectedValueOnce(axiosError(500))
        .mockResolvedValueOnce(axiosResponse(makeRaw()));

      const result = await service.fetchPokemon('pikachu');

      expect(http.axiosRef.get).toHaveBeenCalledTimes(3);
      expect(result.name).toBe('pikachu');
    });

    it('retries on a network error before succeeding', async () => {
      http.axiosRef.get
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(axiosResponse(makeRaw()));

      await service.fetchPokemon('pikachu');

      expect(http.axiosRef.get).toHaveBeenCalledTimes(2);
    });

    it('throws BadGatewayException after exhausting all retries on 5xx', async () => {
      // 1 initial attempt + 3 retries = 4 total calls, all failing.
      http.axiosRef.get.mockRejectedValue(axiosError(500));

      await expect(service.fetchPokemon('pikachu')).rejects.toThrow(
        BadGatewayException,
      );
      expect(http.axiosRef.get).toHaveBeenCalledTimes(4);
    });

    it('throws BadGatewayException after exhausting all retries on network error', async () => {
      http.axiosRef.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.fetchPokemon('pikachu')).rejects.toThrow(
        BadGatewayException,
      );
      expect(http.axiosRef.get).toHaveBeenCalledTimes(4);
    });

    it('does not retry on 404 — it is a deterministic client error', async () => {
      http.axiosRef.get.mockRejectedValue(axiosError(404));

      await expect(service.fetchPokemon('notapokemon')).rejects.toThrow(
        NotFoundException,
      );
      expect(http.axiosRef.get).toHaveBeenCalledTimes(1);
    });

    it('does not retry on other 4xx errors', async () => {
      http.axiosRef.get.mockRejectedValue(axiosError(400));

      await expect(service.fetchPokemon('pikachu')).rejects.toThrow(
        BadGatewayException,
      );
      expect(http.axiosRef.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildTeam', () => {
    it('returns all Pokémon in the team', async () => {
      const bulbasaur = makeRaw({ name: 'bulbasaur', height: 7, weight: 69 });
      http.axiosRef.get
        .mockResolvedValueOnce(axiosResponse(makeRaw()))
        .mockResolvedValueOnce(axiosResponse(bulbasaur));
      const result = await service.buildTeam(['pikachu', 'bulbasaur']);
      expect(result.team).toHaveLength(2);
      expect(result.team[0].name).toBe('pikachu');
      expect(result.team[1].name).toBe('bulbasaur');
    });

    it('allows the same Pokémon twice', async () => {
      http.axiosRef.get.mockResolvedValueOnce(axiosResponse(makeRaw()));
      const result = await service.buildTeam(['pikachu', 'pikachu']);
      expect(result.team).toHaveLength(2);
    });

    it('fetches each unique species only once for a duplicate team', async () => {
      const spy = jest.spyOn(service, 'fetchPokemon');
      http.axiosRef.get.mockResolvedValueOnce(axiosResponse(makeRaw()));
      await service.buildTeam(['pikachu', 'pikachu']);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('propagates NotFoundException when one team member is not found', async () => {
      http.axiosRef.get
        .mockResolvedValueOnce(axiosResponse(makeRaw()))
        .mockRejectedValueOnce(axiosError(404));
      await expect(
        service.buildTeam(['pikachu', 'notapokemon']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('summary', () => {
    it('computes total_weight', async () => {
      const raw1 = makeRaw({ weight: 60 });
      const raw2 = makeRaw({ weight: 40 });
      http.axiosRef.get
        .mockResolvedValueOnce(axiosResponse(raw1))
        .mockResolvedValueOnce(axiosResponse(raw2));
      const { summary } = await service.buildTeam(['a', 'b']);
      expect(summary.total_weight).toBe(100);
    });

    it('computes average_height rounded to 1dp', async () => {
      const raw1 = makeRaw({ height: 4 });
      const raw2 = makeRaw({ height: 7 });
      http.axiosRef.get
        .mockResolvedValueOnce(axiosResponse(raw1))
        .mockResolvedValueOnce(axiosResponse(raw2));
      const { summary } = await service.buildTeam(['a', 'b']);
      expect(summary.average_height).toBe(5.5);
    });

    it('computes total_hp summing all members', async () => {
      const raw1 = makeRaw();
      const raw2 = makeRaw({
        stats: [
          { base_stat: 45, stat: { name: 'hp' } },
          { base_stat: 49, stat: { name: 'attack' } },
          { base_stat: 49, stat: { name: 'defense' } },
          { base_stat: 65, stat: { name: 'special-attack' } },
          { base_stat: 65, stat: { name: 'special-defense' } },
          { base_stat: 45, stat: { name: 'speed' } },
        ],
      });
      http.axiosRef.get
        .mockResolvedValueOnce(axiosResponse(raw1))
        .mockResolvedValueOnce(axiosResponse(raw2));
      const { summary } = await service.buildTeam(['pikachu', 'bulbasaur']);
      expect(summary.total_hp).toBe(35 + 45);
    });

    it('computes type_counts for single-type Pokémon', async () => {
      http.axiosRef.get.mockResolvedValue(axiosResponse(makeRaw()));
      const { summary } = await service.buildTeam(['pikachu']);
      expect(summary.type_counts).toEqual({ electric: 1 });
    });

    it('computes type_counts across multi-type Pokémon', async () => {
      const dualType = makeRaw({
        types: [{ type: { name: 'fire' } }, { type: { name: 'flying' } }],
      });
      http.axiosRef.get
        .mockResolvedValueOnce(axiosResponse(makeRaw()))
        .mockResolvedValueOnce(axiosResponse(dualType));
      const { summary } = await service.buildTeam(['pikachu', 'charizard']);
      expect(summary.type_counts).toEqual({ electric: 1, fire: 1, flying: 1 });
    });

    it('accumulates duplicate types from multiple members', async () => {
      http.axiosRef.get.mockResolvedValueOnce(axiosResponse(makeRaw()));
      const { summary } = await service.buildTeam(['pikachu', 'pikachu']);
      expect(summary.type_counts).toEqual({ electric: 2 });
    });

    it('rounds average_height to 1dp for non-integer averages', async () => {
      // (1 + 1 + 2) / 3 = 1.333... → rounds to 1.3
      http.axiosRef.get
        .mockResolvedValueOnce(axiosResponse(makeRaw({ height: 1 })))
        .mockResolvedValueOnce(axiosResponse(makeRaw({ height: 1 })))
        .mockResolvedValueOnce(axiosResponse(makeRaw({ height: 2 })));
      const { summary } = await service.buildTeam(['a', 'b', 'c']);
      expect(summary.average_height).toBe(1.3);
    });
  });
});
