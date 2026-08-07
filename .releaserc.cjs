const releaseNotesPresetConfig = {
  types: [
    { type: 'feat', section: 'Features', hidden: false },
    { type: 'fix', section: 'Bug Fixes', hidden: false },
    { type: 'perf', section: 'Performance Improvements', hidden: false },
    { type: 'revert', section: 'Reverts', hidden: false },
    { type: 'docs', section: 'Documentation', hidden: false },
    { type: 'refactor', section: 'Code Refactoring', hidden: false },
    { type: 'test', section: 'Tests', hidden: false },
    { type: 'ci', section: 'Continuous Integration', hidden: false },
    { type: 'build', section: 'Build System', hidden: false },
    { type: 'chore', section: 'Miscellaneous Chores', hidden: false }
  ]
};

const releaseNotesWriterOpts = {
  transform: (commit) => {
    const type = commit.revert ? 'revert' : commit.type?.toLowerCase();
    const typeConfig = releaseNotesPresetConfig.types.find((entry) => entry.type === type);

    if (!typeConfig && commit.notes.length === 0) {
      return undefined;
    }

    return {
      ...commit,
      shortHash: commit.shortHash ?? commit.hash?.slice(0, 7),
      type: typeConfig?.section ?? 'Breaking Changes'
    };
  },
  mainTemplate: `{{> header}}
{{#each commitGroups}}
### {{title}}

{{#each commits}}
{{> commit root=@root}}
{{/each}}
{{/each}}
{{> footer}}
`,
  headerPartial: `## {{#if linkCompare}}[{{version}}]({{host}}/{{owner}}/{{repository}}/compare/{{previousTag}}...{{currentTag}}){{else}}{{version}}{{/if}} ({{date}})
`,
  commitPartial: `* {{#if scope}}**{{scope}}:** {{/if}}{{subject}}{{#if hash}} ([{{shortHash}}]({{root.host}}/{{root.owner}}/{{root.repository}}/commit/{{hash}})){{/if}}
`,
  footerPartial: `{{#each noteGroups}}
### ⚠ {{title}}

{{#each notes}}
* {{text}}
{{/each}}
{{/each}}
`
};

module.exports = {
  branches: ['main'],
  repositoryUrl: 'https://github.com/dkirby-ms/zzyix.git',
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
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
        writerOpts: releaseNotesWriterOpts,
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING']
        }
      }
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
        changelogTitle: '---\ntitle: Changelog\ndescription: Release notes and notable changes by version.\n---\n\n## Changelog'
      }
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md'],
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