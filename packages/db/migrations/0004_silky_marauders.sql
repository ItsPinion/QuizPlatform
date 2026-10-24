ALTER TABLE `answers` ADD `selected_option_ids` text;--> statement-breakpoint
ALTER TABLE `answers` ADD `answer_text` text(1000);--> statement-breakpoint
ALTER TABLE `questions` ADD `type` text DEFAULT 'MCQ' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `image_url` text(1000);--> statement-breakpoint
ALTER TABLE `questions` ADD `code_snippet` text(4000);