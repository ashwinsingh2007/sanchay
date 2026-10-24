CREATE TABLE `payslips` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text,
	`employer` text,
	`gross_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`deductions_minor` integer NOT NULL,
	`basic_minor` integer,
	`hra_minor` integer,
	`pf_minor` integer,
	`vpf_minor` integer,
	`nps_minor` integer,
	`tax_minor` integer,
	`professional_tax_minor` integer,
	`earnings` text NOT NULL,
	`deductions` text NOT NULL,
	`file_hash` text NOT NULL,
	`filename` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payslips_file_hash_unique` ON `payslips` (`file_hash`);