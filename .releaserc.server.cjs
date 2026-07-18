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
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING']
        }
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
