/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-infra-to-modules',
      severity: 'error',
      comment:
        'core/, integrations/, config/ and views/ are infrastructure and must not depend on ' +
        'domain modules',
      from: { path: '^src/(core|integrations|config|views)' },
      to: { path: '^src/modules' },
    },
    {
      name: 'no-common-to-modules',
      severity: 'error',
      comment: 'common/ is the innermost layer and must not depend on domain modules',
      from: { path: '^src/common' },
      to: { path: '^src/modules' },
    },
    {
      name: 'no-common-to-core',
      severity: 'error',
      comment:
        'common/ must not depend on core/ infrastructure, except core/logger which is treated ' +
        'as a cross-cutting concern available from any layer',
      from: { path: '^src/common' },
      to: { path: '^src/core', pathNot: '^src/core/logger' },
    },
    {
      name: 'no-config-to-other-layers',
      severity: 'error',
      comment:
        'config/ is foundational, like common/, and must not depend on any other internal ' +
        'layer: it only reads env vars and third-party packages',
      from: { path: '^src/config' },
      to: { path: '^src/(core|common|integrations|views|modules)' },
    },
    {
      name: 'no-cross-module-value-imports',
      severity: 'error',
      comment:
        'domain modules must stay decoupled at runtime; only type-only imports may cross ' +
        'between them (the saga orchestrator needs the shape of the event it reacts to)',
      from: { path: '^src/modules/(subscription|notification|scanner|repository)' },
      to: {
        path: '^src/modules/(subscription|notification|scanner|repository)',
        pathNot: '^src/modules/$1',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'circular dependencies make module boundaries meaningless',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'flag files nothing imports so dead code is easy to spot',
      from: { orphan: true },
      to: {},
    },
  ],
  options: {
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    exclude: {
      path: ['node_modules', 'src/generated', 'dist', 'tests'],
    },
  },
};
