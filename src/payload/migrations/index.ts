import * as migration_20260909_195403_initial from './20260909_195403_initial';

export const migrations = [
  {
    up: migration_20260909_195403_initial.up,
    down: migration_20260909_195403_initial.down,
    name: '20260909_195403_initial'
  },
];
