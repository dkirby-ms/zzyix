ALTER TABLE "operation_log" DROP CONSTRAINT "operation_log_op_type_check";--> statement-breakpoint
ALTER TABLE "tiles" DROP CONSTRAINT "tiles_shape_check";--> statement-breakpoint
ALTER TABLE "tiles" DROP CONSTRAINT "tiles_material_check";--> statement-breakpoint
ALTER TABLE "operation_log" ADD CONSTRAINT "operation_log_op_type_check" CHECK ("operation_log"."op_type" in ('tile_placed', 'tile_removed'));--> statement-breakpoint
ALTER TABLE "tiles" ADD CONSTRAINT "tiles_shape_check" CHECK ("tiles"."shape" in ('square', 'triangle', 'rectangle', 'l-shape'));--> statement-breakpoint
ALTER TABLE "tiles" ADD CONSTRAINT "tiles_material_check" CHECK ("tiles"."material" in ('ceramic', 'glass', 'stone'));