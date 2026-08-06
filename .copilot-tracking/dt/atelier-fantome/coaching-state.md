project:
  name: "Atelier Fantome"
  slug: "atelier-fantome"
  created: "2026-08-06"
  initial_request: "start a new design coaching session to help me design an agentic personality that lives in the app and interacts with users, creates tile art, and other things"
  initial_classification: "frozen"

current:
  method: 3
  space: "problem"
  phase: "design document drafted"

methods_completed: [1, 2]

transition_log:
  - from_method: null
    to_method: 1
    rationale: "Project initialized for scope conversations around an in-app agentic personality."
    date: "2026-08-06"
  - from_method: 1
    to_method: 2
    rationale: "Method 1 produced an initial personality brief and identified intrigue versus intrusion as the primary research tension."
    date: "2026-08-06"
  - from_method: 2
    to_method: 3
    rationale: "Method 2 research planning identified the evidence gaps and provisional tensions to synthesize before solution-space work."
    date: "2026-08-06"

hint_calibration:
  level: 1
  pattern_notes: "User is product owner and chief developer. Session budget is 30 minutes."

session_log:
  - date: "2026-08-06"
    method: 1
    summary: "Initialized project. Canonical deck and customer-card workflow declined. User clarified that the agent should be a distinct personality and living member of the app, not a tool. The resident should evoke intrigue and curiosity, with a longing and ancient attachment to the canvas world and a strong interest in mosaic art. The resident remembers artists and their interactions with it, while increasing familiarity may become intrusive. Memory includes creative history and conversations, with greater restraint around emotional disclosures. The resident may create unsolicited motifs inspired by prior creative work, without altering the artist's originals. Those connections should usually appear as subtle visual echoes for the artist to discover."
  - date: "2026-08-06"
    method: 2
    summary: "Transitioned to Design Research. Created a research plan focused on intrigue, memory, subtle creative echoes, and the boundary between recognition and intrusion."
  - date: "2026-08-06"
    method: 3
    summary: "Transitioned to Input Synthesis with an explicit evidence gap: no participant research has been collected. Created an input inventory for provisional theme clustering."

artifacts:
  - path: ".copilot-tracking/dt/atelier-fantome/method-01-scope-boundaries.md"
    method: 1
    type: "scope-boundaries"
  - path: ".copilot-tracking/dt/atelier-fantome/method-01-assumptions-log.md"
    method: 1
    type: "assumptions-log"
  - path: ".copilot-tracking/dt/atelier-fantome/method-01-agent-personality-design.md"
    method: 1
    type: "agent-personality-design"
  - path: ".copilot-tracking/dt/atelier-fantome/method-02-research-plan.md"
    method: 2
    type: "research-plan"
  - path: ".copilot-tracking/dt/atelier-fantome/method-03-input-inventory.md"
    method: 3
    type: "input-inventory"
  - path: ".copilot-tracking/dt/atelier-fantome/agent-design.md"
    method: 3
    type: "agent-design"

canonical_deck:
  enabled: false
  decision_date: "2026-08-06"
  decision: "declined"

customer_card_render:
  enabled: false
