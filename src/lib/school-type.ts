/**
 * School type and operating mode.
 *
 * The ONLY module permitted to compare `school_type` values. Everything else
 * must read a feature flag from here (CLAUDE.md section 4A). A test in
 * `tests/unit/no-scattered-school-type.test.ts` fails the build if a direct
 * comparison appears anywhere else.
 *
 * `operating_mode` is derived, never stored independently. The database also
 * derives it as a generated column; this module mirrors that derivation so the
 * UI and the RLS world can never disagree.
 */

export const SCHOOL_TYPES = ['primary', 'junior', 'primary_junior', 'senior'] as const
export type SchoolType = (typeof SCHOOL_TYPES)[number]

export const OPERATING_MODES = ['basic', 'senior'] as const
export type OperatingMode = (typeof OPERATING_MODES)[number]

/** Exit checkpoints in basic mode. Senior schools have none. */
export type ExitCheckpoint = 'KPSEA' | 'KJSEA'

export interface SchoolTypeDefinition {
  readonly label: string
  readonly description: string
  readonly mode: OperatingMode
  /** Class labels in promotion order, seeded at onboarding. */
  readonly classes: readonly string[]
  readonly levels: readonly { readonly stage: string; readonly name: string }[]
  readonly exitCheckpoints: readonly ExitCheckpoint[]
  /** Grade at which learners leave this school type, if any. */
  readonly terminalClass: string | null
  /** Learner status used when they finish the terminal class. */
  readonly terminalStatus: 'completed' | 'graduated' | null
}

const CBC_LEVELS = {
  prePrimary: { stage: 'pre_primary', name: 'Pre Primary' },
  lowerPrimary: { stage: 'lower_primary', name: 'Lower Primary' },
  upperPrimary: { stage: 'upper_primary', name: 'Upper Primary' },
  juniorSchool: { stage: 'junior_school', name: 'Junior School' },
  seniorSchool: { stage: 'senior_school', name: 'Senior School' },
} as const

const PRIMARY_CLASSES = [
  'PP1',
  'PP2',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
] as const

const JUNIOR_CLASSES = ['Grade 7', 'Grade 8', 'Grade 9'] as const

const SENIOR_CLASSES = ['Grade 10', 'Grade 11', 'Grade 12'] as const

export const SCHOOL_TYPE_DEFINITIONS: Record<SchoolType, SchoolTypeDefinition> = {
  primary: {
    label: 'Primary school',
    description: 'PP1 to Grade 6. Learners move on at the end of Grade 6.',
    mode: 'basic',
    classes: PRIMARY_CLASSES,
    levels: [
      CBC_LEVELS.prePrimary,
      CBC_LEVELS.lowerPrimary,
      CBC_LEVELS.upperPrimary,
    ],
    exitCheckpoints: ['KPSEA'],
    terminalClass: 'Grade 6',
    // Learners leave for a junior school; they have not graduated.
    terminalStatus: 'completed',
  },

  junior: {
    label: 'Junior school',
    description: 'Grade 7 to Grade 9. Learners sit KJSEA at the end of Grade 9.',
    mode: 'basic',
    classes: JUNIOR_CLASSES,
    levels: [CBC_LEVELS.juniorSchool],
    exitCheckpoints: ['KJSEA'],
    terminalClass: 'Grade 9',
    terminalStatus: 'completed',
  },

  primary_junior: {
    label: 'Primary and junior school',
    description: 'PP1 to Grade 9 as one institution. Learners move on after Grade 9.',
    mode: 'basic',
    classes: [...PRIMARY_CLASSES, ...JUNIOR_CLASSES],
    levels: [
      CBC_LEVELS.prePrimary,
      CBC_LEVELS.lowerPrimary,
      CBC_LEVELS.upperPrimary,
      CBC_LEVELS.juniorSchool,
    ],
    exitCheckpoints: ['KPSEA', 'KJSEA'],
    terminalClass: 'Grade 9',
    terminalStatus: 'completed',
  },

  senior: {
    label: 'Senior school',
    description: 'Grade 10 to Grade 12. Learners are placed from other schools after Grade 9.',
    mode: 'senior',
    classes: SENIOR_CLASSES,
    levels: [CBC_LEVELS.seniorSchool],
    // Senior schools have no KPSEA/KJSEA checkpoints.
    exitCheckpoints: [],
    terminalClass: 'Grade 12',
    terminalStatus: 'graduated',
  },
}

export function isSchoolType(value: unknown): value is SchoolType {
  return typeof value === 'string' && (SCHOOL_TYPES as readonly string[]).includes(value)
}

export function getSchoolTypeDefinition(schoolType: SchoolType): SchoolTypeDefinition {
  return SCHOOL_TYPE_DEFINITIONS[schoolType]
}

/**
 * Derive the operating mode. Mirrors the generated column on `tenants`.
 */
export function getOperatingMode(schoolType: SchoolType): OperatingMode {
  return SCHOOL_TYPE_DEFINITIONS[schoolType].mode
}

/* ------------------------------------------------------------------ *
 * Feature flags. Call these instead of comparing school types.
 * ------------------------------------------------------------------ */

/** Pathways and subject combinations exist only in senior mode. */
export function hasPathways(mode: OperatingMode): boolean {
  return mode === 'senior'
}

/** One class teacher covers many learning areas: basic mode only. */
export function usesClassTeacherModel(mode: OperatingMode): boolean {
  return mode === 'basic'
}

/** KPSEA and KJSEA exit checkpoints: basic mode only. */
export function hasExitCheckpoints(mode: OperatingMode): boolean {
  return mode === 'basic'
}

/** Morning and evening boarding roll-calls: senior mode only. */
export function hasBoardingRollCall(mode: OperatingMode): boolean {
  return mode === 'senior'
}

/** CBC learning areas, strands and sub-strands: basic mode only. */
export function usesLearningAreas(mode: OperatingMode): boolean {
  return mode === 'basic'
}

/** Learners arrive from other schools after Grade 9: senior mode only. */
export function usesIntakePlacement(mode: OperatingMode): boolean {
  return mode === 'senior'
}

/** Boarding module (houses, dormitories, beds, exeat): senior mode only. */
export function hasBoardingModule(mode: OperatingMode): boolean {
  return mode === 'senior'
}

/** Subject-based marks entry: senior mode only. */
export function usesSubjectBasedAssessment(mode: OperatingMode): boolean {
  return mode === 'senior'
}

/* ------------------------------------------------------------------ *
 * Derived helpers
 * ------------------------------------------------------------------ */

export function getExitCheckpoints(schoolType: SchoolType): readonly ExitCheckpoint[] {
  return SCHOOL_TYPE_DEFINITIONS[schoolType].exitCheckpoints
}

/** Which exit checkpoint, if any, applies to a class label. */
const EXIT_CHECKPOINT_CLASS: Record<string, ExitCheckpoint> = {
  'Grade 6': 'KPSEA',
  'Grade 9': 'KJSEA',
}

/**
 * True when promotion through `classLabel` should be blocked pending an exit
 * result. Senior mode never holds learners.
 *
 * Keyed off the class's own checkpoint rather than the school's terminal class.
 * A combined primary and junior school has TWO checkpoint classes, Grade 6 and
 * Grade 9, and only Grade 9 is terminal. Comparing against terminalClass alone
 * silently dropped the Grade 6 hold, which disagreed with app.exit_checkpoint_for()
 * in Postgres and would have shown an admin the wrong list of held learners.
 */
export function isExitCheckpointClass(schoolType: SchoolType, classLabel: string): boolean {
  const definition = SCHOOL_TYPE_DEFINITIONS[schoolType]
  if (definition.exitCheckpoints.length === 0) return false

  const checkpoint = EXIT_CHECKPOINT_CLASS[classLabel]
  return checkpoint !== undefined && definition.exitCheckpoints.includes(checkpoint)
}

/** The checkpoint code for a class label, or null when none applies. */
export function getExitCheckpointForClass(
  schoolType: SchoolType,
  classLabel: string,
): ExitCheckpoint | null {
  if (!isExitCheckpointClass(schoolType, classLabel)) return null
  return EXIT_CHECKPOINT_CLASS[classLabel]
}

/**
 * Learner status once the terminal class is completed, or null when the class
 * is not terminal for this school type.
 */
export function getTerminalStatus(
  schoolType: SchoolType,
  classLabel: string,
): 'completed' | 'graduated' | null {
  const definition = SCHOOL_TYPE_DEFINITIONS[schoolType]
  if (definition.terminalClass !== classLabel) return null
  return definition.terminalStatus
}

/** Classes offered by a school type, in promotion order. */
export function getClassesForSchoolType(schoolType: SchoolType): readonly string[] {
  return SCHOOL_TYPE_DEFINITIONS[schoolType].classes
}