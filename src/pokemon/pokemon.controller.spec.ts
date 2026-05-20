import { Test, TestingModule } from '@nestjs/testing';
import { PokemonController } from './pokemon.controller';
import { PokemonService } from './pokemon.service';
import { TeamResponse } from './dto/team-response.dto';

const mockTeamResponse: TeamResponse = {
  team: [
    {
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
      image: 'http://example.com/pikachu.png',
      abilities: ['static'],
      base_experience: 112,
    },
  ],
  summary: {
    total_weight: 60,
    average_height: 4,
    total_hp: 35,
    type_counts: { electric: 1 },
  },
};

describe('PokemonController', () => {
  let controller: PokemonController;
  let service: { buildTeam: jest.Mock };

  beforeEach(async () => {
    service = { buildTeam: jest.fn().mockResolvedValue(mockTeamResponse) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PokemonController],
      providers: [{ provide: PokemonService, useValue: service }],
    }).compile();
    controller = module.get(PokemonController);
  });

  // The controller receives a pre-parsed string[] from TeamQueryDto (via ValidationPipe).
  // These tests call getTeam() directly with already-transformed arrays.

  it('passes names directly to buildTeam', async () => {
    await controller.getTeam({ names: ['pikachu', 'charizard', 'bulbasaur'] });
    expect(service.buildTeam).toHaveBeenCalledWith([
      'pikachu',
      'charizard',
      'bulbasaur',
    ]);
  });

  it('returns the service result directly', async () => {
    const result = await controller.getTeam({ names: ['pikachu'] });
    expect(result).toBe(mockTeamResponse);
  });

  it('allows duplicate names', async () => {
    await controller.getTeam({ names: ['pikachu', 'pikachu'] });
    expect(service.buildTeam).toHaveBeenCalledWith(['pikachu', 'pikachu']);
  });
});
