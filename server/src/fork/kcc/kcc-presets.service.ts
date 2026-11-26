import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { KccOptionSchema, KccOptionValues, KccPreset, KccPresetInput } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { KCC_MANAGED_OPTIONS, validateOptionValues } from './kcc-args';
import { KccClientService } from './kcc-client.service';
import { type KccPresetRow, KccRepository } from './kcc.repository';

const MAX_PRESETS_PER_USER = 50;

/** The user's saved KCC option sets, and KCC's own option list to build them from. */
@Injectable()
export class KccPresetsService {
  constructor(
    private readonly repo: KccRepository,
    private readonly client: KccClientService,
  ) {}

  async optionSchema(): Promise<KccOptionSchema> {
    const remote = await this.client.schema();
    const managed = new Set<string>(KCC_MANAGED_OPTIONS);
    return {
      version: remote.version,
      profiles: remote.profiles,
      managed: [...KCC_MANAGED_OPTIONS],
      groups: remote.groups
        .map((group) => ({ ...group, options: group.options.filter((option) => !managed.has(option.dest)) }))
        .filter((group) => group.options.length > 0),
    };
  }

  async list(user: RequestUser): Promise<KccPreset[]> {
    return (await this.repo.listPresets(user.id)).map(toDto);
  }

  async create(user: RequestUser, input: KccPresetInput): Promise<KccPreset> {
    this.assertOptions(input.options);
    if ((await this.repo.listPresets(user.id)).length >= MAX_PRESETS_PER_USER) {
      throw new BadRequestException({ errorCode: 'KCC_TOO_MANY_PRESETS', message: `At most ${MAX_PRESETS_PER_USER} presets` });
    }
    await this.assertNameFree(user.id, input.name);
    return toDto(await this.repo.createPreset(user.id, input.name, input.options));
  }

  async update(user: RequestUser, id: number, input: KccPresetInput): Promise<KccPreset> {
    this.assertOptions(input.options);
    await this.assertNameFree(user.id, input.name, id);
    const row = await this.repo.updatePreset(user.id, id, input.name, input.options);
    if (!row) throw new NotFoundException('Preset not found');
    return toDto(row);
  }

  async remove(user: RequestUser, id: number): Promise<void> {
    if (!(await this.repo.deletePreset(user.id, id))) throw new NotFoundException('Preset not found');
  }

  private assertOptions(options: KccOptionValues): void {
    const problem = validateOptionValues(options);
    if (problem) throw new BadRequestException({ errorCode: 'KCC_INVALID_OPTIONS', message: problem });
  }

  private async assertNameFree(userId: number, name: string, exceptId?: number): Promise<void> {
    const existing = await this.repo.findPresetByName(userId, name);
    if (existing && existing.id !== exceptId)
      throw new ConflictException({ errorCode: 'KCC_PRESET_NAME_TAKEN', message: 'A preset with this name exists' });
  }
}

function toDto(row: KccPresetRow): KccPreset {
  return { id: row.id, name: row.name, options: row.options, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
