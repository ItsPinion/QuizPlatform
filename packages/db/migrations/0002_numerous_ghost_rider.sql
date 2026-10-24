CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`quiz_id` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_attempt_unique` ON `certificates` (`attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_code_unique` ON `certificates` (`code`);--> statement-breakpoint
CREATE INDEX `certificates_user_idx` ON `certificates` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`related_id` text,
	`error` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_outbox_status_idx` ON `email_outbox` (`status`);--> statement-breakpoint
CREATE INDEX `email_outbox_user_idx` ON `email_outbox` (`to_email`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_token_unique` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`user_id` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`total_marks` integer DEFAULT 0 NOT NULL,
	`percentage` real DEFAULT 0 NOT NULL,
	`correct_answers` integer DEFAULT 0 NOT NULL,
	`incorrect_answers` integer DEFAULT 0 NOT NULL,
	`unanswered` integer DEFAULT 0 NOT NULL,
	`time_taken_seconds` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`question_order` text,
	`option_order` text,
	`negative_marks` real DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_attempts`("id", "quiz_id", "user_id", "score", "total_marks", "percentage", "correct_answers", "incorrect_answers", "unanswered", "time_taken_seconds", "status", "started_at", "expires_at", "completed_at") SELECT "id", "quiz_id", "user_id", "score", "total_marks", "percentage", "correct_answers", "incorrect_answers", "unanswered", "time_taken_seconds", "status", "started_at", "expires_at", "completed_at" FROM `attempts`;--> statement-breakpoint
DROP TABLE `attempts`;--> statement-breakpoint
ALTER TABLE `__new_attempts` RENAME TO `attempts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `attempts_user_idx` ON `attempts` (`user_id`);--> statement-breakpoint
CREATE INDEX `attempts_quiz_idx` ON `attempts` (`quiz_id`);--> statement-breakpoint
CREATE INDEX `attempts_status_idx` ON `attempts` (`status`);--> statement-breakpoint
ALTER TABLE `quizzes` ADD `available_from` integer;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `available_until` integer;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `shuffle_questions` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `shuffle_options` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `negative_marks` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `certificate_enabled` integer DEFAULT true NOT NULL;