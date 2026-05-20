import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import request from 'supertest';
import { App } from 'supertest/types';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { AppModule } from '../src/app.module';
import { PokeApiPokemon } from '../src/pokemon/interfaces/pokeapi.interface';
import { TeamResponse } from '../src/pokemon/dto/team-response.dto';

function makeRaw(
  name: string,
  overrides: Partial<PokeApiPokemon> = {},
): PokeApiPokemon {
  return {
    name,
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
    abilities: [{ ability: { name: 'static' } }],
    sprites: {
      front_default: `http://example.com/${name}.png`,
      other: {
        'official-artwork': {
          front_default: `http://example.com/${name}-art.png`,
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
  return new AxiosError('error', undefined, undefined, undefined, {
    status,
    statusText: '',
    data: null,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

describe('GET /pokemon/team (e2e)', () => {
  let app: INestApplication<App>;
  let httpGet: jest.Mock;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CACHE_MANAGER)
      .useValue({
        get: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    const httpService = moduleFixture.get(HttpService);
    httpGet = jest.spyOn(httpService.axiosRef, 'get') as jest.Mock;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('returns 200 with team and summary for a single Pokémon', async () => {
    httpGet.mockResolvedValue(axiosResponse(makeRaw('pikachu')));

    const res = await request(app.getHttpServer())
      .get('/pokemon/team?names=pikachu')
      .expect(200);

    const body = res.body as TeamResponse;
    expect(body.team).toHaveLength(1);
    expect(body.team[0].name).toBe('pikachu');
    expect(body.summary).toBeDefined();
    expect(body.summary.total_weight).toBe(60);
    expect(body.summary.total_hp).toBe(35);
    expect(body.summary.average_height).toBe(4);
    expect(body.summary.type_counts).toEqual({ electric: 1 });
  });

  it('returns 200 with correct team for three Pokémon', async () => {
    httpGet
      .mockResolvedValueOnce(axiosResponse(makeRaw('pikachu')))
      .mockResolvedValueOnce(
        axiosResponse(
          makeRaw('charizard', {
            types: [{ type: { name: 'fire' } }, { type: { name: 'flying' } }],
            weight: 905,
            stats: [
              { base_stat: 78, stat: { name: 'hp' } },
              { base_stat: 84, stat: { name: 'attack' } },
              { base_stat: 78, stat: { name: 'defense' } },
              { base_stat: 109, stat: { name: 'special-attack' } },
              { base_stat: 85, stat: { name: 'special-defense' } },
              { base_stat: 100, stat: { name: 'speed' } },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        axiosResponse(
          makeRaw('bulbasaur', {
            types: [{ type: { name: 'grass' } }, { type: { name: 'poison' } }],
            weight: 69,
          }),
        ),
      );

    const res = await request(app.getHttpServer())
      .get('/pokemon/team?names=pikachu,charizard,bulbasaur')
      .expect(200);

    const body = res.body as TeamResponse;
    expect(body.team).toHaveLength(3);
    expect(body.summary.type_counts).toEqual({
      electric: 1,
      fire: 1,
      flying: 1,
      grass: 1,
      poison: 1,
    });
    expect(body.summary.total_weight).toBe(60 + 905 + 69);
  });

  it('allows the same Pokémon twice (duplicates)', async () => {
    // Deduplication means only one fetch for the same name.
    httpGet.mockResolvedValueOnce(axiosResponse(makeRaw('pikachu')));

    const res = await request(app.getHttpServer())
      .get('/pokemon/team?names=pikachu,pikachu')
      .expect(200);

    const body = res.body as TeamResponse;
    expect(body.team).toHaveLength(2);
    expect(body.summary.type_counts).toEqual({ electric: 2 });
    expect(body.summary.total_weight).toBe(120);
  });

  it('accepts exactly 6 Pokémon (max team size)', async () => {
    httpGet.mockResolvedValue(axiosResponse(makeRaw('pikachu')));

    const res = await request(app.getHttpServer())
      .get('/pokemon/team?names=a,b,c,d,e,f')
      .expect(200);

    const body = res.body as TeamResponse;
    expect(body.team).toHaveLength(6);
  });

  it('returns 400 for more than 6 Pokémon names', async () => {
    await request(app.getHttpServer())
      .get('/pokemon/team?names=a,b,c,d,e,f,g')
      .expect(400);
  });

  it('returns 400 when names param is missing', async () => {
    await request(app.getHttpServer()).get('/pokemon/team').expect(400);
  });

  it('returns 404 when a Pokémon name is not found', async () => {
    httpGet.mockRejectedValue(axiosError(404));

    await request(app.getHttpServer())
      .get('/pokemon/team?names=notapokemon')
      .expect(404);
  });

  it('returns 502 when PokéAPI is unavailable', async () => {
    // Fire retry delays immediately (≤ 1500 ms) but NOT the ThrottlerStorageService's
    // 60 s expiry timer: that callback references its own timeoutId via closure, and
    // calling it synchronously triggers a temporal dead zone ReferenceError before the
    // assignment completes.
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((fn: TimerHandler, delay?: number) => {
        if (typeof fn === 'function' && (delay ?? 0) < 10_000)
          (fn as () => void)();
        return 0 as unknown as NodeJS.Timeout;
      });

    httpGet.mockRejectedValue(axiosError(500));

    await request(app.getHttpServer())
      .get('/pokemon/team?names=pikachu')
      .expect(502);
  });

  it('includes image from official-artwork sprite', async () => {
    httpGet.mockResolvedValue(axiosResponse(makeRaw('pikachu')));

    const res = await request(app.getHttpServer())
      .get('/pokemon/team?names=pikachu')
      .expect(200);

    const body = res.body as TeamResponse;
    expect(body.team[0].image).toBe('http://example.com/pikachu-art.png');
  });

  it('falls back to front_default when official-artwork is absent', async () => {
    httpGet.mockResolvedValue(
      axiosResponse(
        makeRaw('pikachu', {
          sprites: { front_default: 'http://example.com/pikachu.png' },
        }),
      ),
    );

    const res = await request(app.getHttpServer())
      .get('/pokemon/team?names=pikachu')
      .expect(200);

    expect((res.body as TeamResponse).team[0].image).toBe(
      'http://example.com/pikachu.png',
    );
  });

  it('lowercases names before fetching', async () => {
    httpGet.mockResolvedValue(axiosResponse(makeRaw('pikachu')));

    const res = await request(app.getHttpServer())
      .get('/pokemon/team?names=Pikachu')
      .expect(200);

    expect((res.body as TeamResponse).team[0].name).toBe('pikachu');
  });

  it('returns 400 for an empty names param', async () => {
    await request(app.getHttpServer()).get('/pokemon/team?names=').expect(400);
  });

  it('returns 404 when one name in a multi-member team is not found', async () => {
    httpGet
      .mockResolvedValueOnce(axiosResponse(makeRaw('pikachu')))
      .mockRejectedValueOnce(axiosError(404));

    await request(app.getHttpServer())
      .get('/pokemon/team?names=pikachu,notapokemon')
      .expect(404);
  });
});
