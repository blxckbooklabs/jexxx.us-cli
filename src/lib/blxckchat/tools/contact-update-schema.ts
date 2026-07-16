/** JSON-schema fragment for update_contact.updates — mirrors dashboard columns. */
export const CONTACT_UPDATE_PROPERTIES = {
  name: { type: "string", description: "Display name" },
  photo: { type: "string", description: "Photo URL" },
  notes: { type: "string", description: "Free-form notes (not for phone/email)" },
  tags: { type: "array", items: { type: "string" }, description: "Tags" },
  phone: {
    type: "string",
    description: "Phone number — dedicated column shown in BLXCKBOOK/NXT dashboards",
  },
  email: { type: "string", description: "Email address — dedicated column" },
  social_links: {
    type: "array",
    description: 'Social links, e.g. [{"platform":"instagram","url":"https://..."}]',
    items: {
      type: "object",
      properties: {
        platform: { type: "string" },
        url: { type: "string" },
      },
    },
  },
  relationship_status: {
    type: "string",
    description: "Talking | Dating | Committed | Ended",
  },
  visibility: {
    type: "string",
    enum: ["private", "shared", "ecosystem"],
  },
  is_discoverable: { type: "boolean" },
  linked_ecosystem_id: { type: "string", description: "Linked JEXXXUS user id" },
  priority_level: {
    type: "string",
    description: "NXT priority: MAXIMUM | High | Medium | Low",
  },
  primary_platform: { type: "string", description: "NXT primary platform" },
  personality_traits: {
    type: "array",
    items: { type: "string" },
    description: "NXT personality traits",
  },
  urls: { type: "array", items: { type: "string" }, description: "NXT profile URLs" },
  vibe: { type: "string", description: "NXT vibe label" },
  engagement_style: { type: "string", description: "NXT engagement style" },
  chemistry_notes: { type: "string", description: "NXT chemistry notes" },
  last_interaction_date: {
    type: "string",
    description: "ISO timestamp of last interaction",
  },
  metadata: { type: "object", description: "Arbitrary JSON metadata object" },
} as const;

export const CONTACT_UPDATABLE_FIELD_LIST =
  "name, photo, notes, tags, phone, email, social_links, relationship_status, visibility, " +
  "is_discoverable, linked_ecosystem_id, priority_level, primary_platform, personality_traits, " +
  "urls, vibe, engagement_style, chemistry_notes, last_interaction_date, metadata";