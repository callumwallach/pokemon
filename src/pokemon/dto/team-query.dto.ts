import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

/** Validated query parameters for the `GET /pokemon/team` endpoint */
export class TeamQueryDto {
  @ApiProperty({
    description:
      'Comma-separated list of Pokémon names to include in the team (min 1, max 6, duplicates allowed)',
    example: 'pikachu,charizard,bulbasaur',
  })
  @Transform(({ value }) =>
    String(value)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  names: string[];
}
