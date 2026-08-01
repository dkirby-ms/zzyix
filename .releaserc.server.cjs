const releaseNotesPresetConfig = {
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
    { type: 'perf', section: 'Performance Improvements' },
    { type: 'revert', section: 'Reverts' },
    { type: 'docs', section: 'Documentation' },
    { type: 'refactor', section: 'Code Refactoring' },
    { type: 'test', section: 'Tests' },
    { type: 'ci', section: 'Continuous Integration' },
    { type: 'build', section: 'Build System' },
    { type: 'chore', section: 'Miscellaneous Chores' }
  ]
};

module.exports = {
  branches: ['main'],
  repositoryUrl: 'https://github.com/dkirby-ms/zzyix.git',
  tagFormat: 'server-v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { scope: 'server', release: 'patch' },
          { scope: 'db', release: 'patch' },
          { scope: 'jobs', release: 'patch' },
          { scope: 'api', release: 'patch' },
          { scope: 'domain-server', release: 'patch' },
          { scope: 'deps-server', release: 'patch' },
          { scope: 'repo', release: false }
        ],
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING']
        }
      }
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: releaseNotesPresetConfig,
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING']
        }
      }
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.server.md'
      }
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.server.md'],
        message: 'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}'
      }
    ],
    [
      '@semantic-release/github',
      {
        successComment: false,
        failComment: false,
        releasedLabels: false
      }
    ]
  ]
};
