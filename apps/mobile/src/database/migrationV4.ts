/** Run inside the migration transaction. All times in new domain tables are UTC milliseconds. */
export const migrationV4 = `
CREATE TABLE application_commands (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 command_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL,
 input_json TEXT NOT NULL,
 recorded_at INTEGER NOT NULL,
 affects_context INTEGER NOT NULL CHECK(affects_context IN (0,1)),
 result_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE intention_contexts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 kind TEXT NOT NULL CHECK(kind IN ('activity','leisure','open')),
 label TEXT NOT NULL,
 promise_id INTEGER REFERENCES promises(id) ON DELETE RESTRICT,
 planned_until INTEGER,
 fresh_until INTEGER NOT NULL,
 time_zone TEXT NOT NULL,
 recorded_at INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('direct','promise_start','retrospective')),
 predecessor_context_id INTEGER REFERENCES intention_contexts(id),
 CHECK(kind = 'activity' OR promise_id IS NULL)
);
CREATE TABLE context_interval_versions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 context_id INTEGER NOT NULL REFERENCES intention_contexts(id),
 effective_start INTEGER NOT NULL,
 effective_end INTEGER NOT NULL,
 introduced_revision INTEGER NOT NULL REFERENCES application_commands(id),
 superseded_revision INTEGER REFERENCES application_commands(id),
 end_reason TEXT NOT NULL CHECK(end_reason IN ('freshness','switched','ended','historical_correction')),
 CHECK(effective_start < effective_end),
 CHECK(superseded_revision IS NULL OR superseded_revision > introduced_revision)
);
CREATE INDEX context_current ON context_interval_versions(effective_start,effective_end) WHERE superseded_revision IS NULL;
CREATE INDEX context_history ON context_interval_versions(introduced_revision,superseded_revision);
CREATE TRIGGER context_insert_guard BEFORE INSERT ON context_interval_versions BEGIN
 SELECT CASE WHEN NEW.effective_end > (SELECT fresh_until FROM intention_contexts WHERE id=NEW.context_id)
 THEN RAISE(ABORT,'Coverage exceeds freshness') END;
 SELECT CASE WHEN NEW.superseded_revision IS NULL AND EXISTS (
 SELECT 1 FROM context_interval_versions WHERE superseded_revision IS NULL
 AND effective_start < NEW.effective_end AND NEW.effective_start < effective_end
 ) THEN RAISE(ABORT,'Context intervals overlap') END;
END;
CREATE TRIGGER context_version_immutable BEFORE UPDATE ON context_interval_versions BEGIN
 SELECT CASE WHEN NEW.context_id != OLD.context_id OR NEW.effective_start != OLD.effective_start
 OR NEW.effective_end != OLD.effective_end OR NEW.introduced_revision != OLD.introduced_revision
 OR NEW.end_reason != OLD.end_reason OR OLD.superseded_revision IS NOT NULL OR NEW.superseded_revision IS NULL
 THEN RAISE(ABORT,'Historical interval versions are immutable') END;
END;
CREATE TRIGGER context_declaration_immutable BEFORE UPDATE ON intention_contexts BEGIN
 SELECT RAISE(ABORT,'Context declarations are immutable');
END;
CREATE TABLE behavior_reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 effective_start INTEGER NOT NULL,
 effective_end INTEGER NOT NULL,
 recorded_at INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source='manual'),
 description TEXT NOT NULL,
 relation TEXT NOT NULL CHECK(relation IN ('consistent','conflicting','unclear')),
 deliberateness TEXT NOT NULL CHECK(deliberateness IN ('intentional','unintended','unsure')),
 context_id INTEGER REFERENCES intention_contexts(id),
 CHECK(effective_start < effective_end AND effective_end <= recorded_at)
);
CREATE INDEX report_intervals ON behavior_reports(effective_start,effective_end);
CREATE TABLE drift_assessments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 report_id INTEGER NOT NULL REFERENCES behavior_reports(id),
 evaluator_version TEXT NOT NULL,
 context_revision INTEGER NOT NULL,
 recorded_at INTEGER NOT NULL,
 segments_json TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 supersedes_assessment_id INTEGER REFERENCES drift_assessments(id)
);
CREATE INDEX assessments_report ON drift_assessments(report_id,id);
CREATE TABLE assessment_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 assessment_id INTEGER NOT NULL REFERENCES drift_assessments(id),
 report_id INTEGER NOT NULL REFERENCES behavior_reports(id),
 effective_start INTEGER NOT NULL,
 effective_end INTEGER NOT NULL,
 recorded_at INTEGER NOT NULL,
 response TEXT NOT NULL CHECK(response IN ('intentional','supporting_purpose','plans_changed','unintended','disputed','unsure')),
 explanation TEXT NOT NULL,
 supersedes_review_id INTEGER REFERENCES assessment_reviews(id),
 command_revision INTEGER NOT NULL REFERENCES application_commands(id),
 CHECK(effective_start < effective_end)
);
CREATE INDEX reviews_report ON assessment_reviews(report_id,command_revision);
ALTER TABLE behavior_events ADD COLUMN recorded_at TEXT;
ALTER TABLE behavior_events ADD COLUMN command_id INTEGER REFERENCES application_commands(id);
CREATE INDEX events_command ON behavior_events(command_id);
`;
