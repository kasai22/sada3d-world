import * as migration_20260909_195403_initial from './20260909_195403_initial';
import * as migration_20260913_061354_content_reset_fields from './20260913_061354_content_reset_fields';
import * as migration_20260913_170355_stage_19_6_approval from './20260913_170355_stage_19_6_approval';
import * as migration_20260913_180505_stage_19_7_commercial_definition from './20260913_180505_stage_19_7_commercial_definition';
import * as migration_20260913_190224_stage_19_8_admin_catalog from './20260913_190224_stage_19_8_admin_catalog';
import * as migration_20260914_171146_stage_20_commercial_catalog from './20260914_171146_stage_20_commercial_catalog';

export const migrations = [
  {
    up: migration_20260909_195403_initial.up,
    down: migration_20260909_195403_initial.down,
    name: '20260909_195403_initial',
  },
  {
    up: migration_20260913_061354_content_reset_fields.up,
    down: migration_20260913_061354_content_reset_fields.down,
    name: '20260913_061354_content_reset_fields',
  },
  {
    up: migration_20260913_170355_stage_19_6_approval.up,
    down: migration_20260913_170355_stage_19_6_approval.down,
    name: '20260913_170355_stage_19_6_approval',
  },
  {
    up: migration_20260913_180505_stage_19_7_commercial_definition.up,
    down: migration_20260913_180505_stage_19_7_commercial_definition.down,
    name: '20260913_180505_stage_19_7_commercial_definition',
  },
  {
    up: migration_20260913_190224_stage_19_8_admin_catalog.up,
    down: migration_20260913_190224_stage_19_8_admin_catalog.down,
    name: '20260913_190224_stage_19_8_admin_catalog',
  },
  {
    up: migration_20260914_171146_stage_20_commercial_catalog.up,
    down: migration_20260914_171146_stage_20_commercial_catalog.down,
    name: '20260914_171146_stage_20_commercial_catalog'
  },
];
