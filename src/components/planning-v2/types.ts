export type RouteStatusItem={
 route_key:string;
 source_operation:string;
 source_seq:number;
 occurrence:number;
 standard_operation:string|null;
 planning_job_operation_id:number|null;
 planning_job_status:string|null;
 ready_source_seq:number|null;
 route_status:string;
 batch_id:number|null;
 batch_no:string|null;
 batch_status:string|null;
 schedule_id:number|null;
 schedule_status:string|null;
 resource_code:string|null;
 planned_start:string|null;
 planned_end:string|null;
 recipe_no:string|null;
 recipe_name:string|null;
 effective_recipe_key?:string|null;
 effective_recipe_no?:string|null;
 effective_recipe_name?:string|null;
 batch_key_suggest?:string|null;
 batch_prefix_suggest?:string|null;
};

export type Candidate={
 id:number;
 job_num:string;
 part_num:string|null;
 revision_num:string|null;
 program:string|null;
 part_master_primer1:string|null;
 part_master_primer2:string|null;
 part_master_primer3:string|null;
 part_master_topcoat1:string|null;
 part_master_topcoat2:string|null;
 part_master_antiabration:string|null;
 part_master_varnish:string|null;
 plan_qty:number;
 plan_surface:number;
 source_operation_code:string;
 standard_operation:string;
 st_group:string|null;
 area_name:string|null;
 recipe_key:string|null;
 recipe_no:string|null;
 recipe_name:string|null;
 previous_standard_operation:string|null;
 next_standard_operation:string|null;
 priority_type:string|null;
 recipe_required:boolean;
 planning_status:"LOCKED"|"ELIGIBLE"|"PLANNED"|string;
 has_planning_chain?:boolean;
 route_resolution_mode?:"BRIDGE_PAIR"|"ALLOPERATION_FALLBACK"|"DIRECT_NEXT_MAIN"|"NO_CHAIN_ALL_MAIN"|string|null;
 next_operation_type?:"PLANNING_OPERATION"|"INTERMEDIATE"|"ST_SCOPE_ONLY"|string|null;
 intermediate_previous_main?:string|null;
 intermediate_next_main?:string|null;
 source_seq:number|null;
 batch_no:string|null;
 batch_id:number|null;
 batch_status:string|null;
 previous_planning_status:string|null;
 previous_planning_operation:string|null;
 previous_batch_no:string|null;
 previous_batch_id:number|null;
 previous_batch_status:string|null;
 previous_batch_operation:string|null;
 previous_batch_source_operation:string|null;
 previous_batch_source_seq:number|null;
 effective_recipe_key:string|null;
 batch_key_suggest:string|null;
 batch_prefix_suggest:string|null;
 part_cluster:string|null;
 part_description:string|null;
 prod_qty:number|null;
 current_good_wip_qty:number|null;
 last_labor_qty:number|null;
 last_operation:string|null;
 next_operation:string|null;
 next_operation_planning_sort_order:number|null;
 all_operation:string|null;
 total_surface:number|null;
 surface_per_part_dm2:number|null;
 open_dmr:string|null;
 st:string|null;
 st_wip_area:string|null;
 wip_sequence:string|null;
 cat35_transit:string|null;
 impact_sale_value:string|null;
 last_import_status:string|null;
 first_seen_at:string|null;
 last_seen_at:string|null;
 last_changed_at:string|null;
 source_data:Record<string,unknown>|null;
 route_status:RouteStatusItem[];
 route_status_loaded?:boolean;
};

export type TimeRule={
 calc_type:string;
 priority:number;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 fixed_hours:number|null;
 standard_hours:number|null;
};

export type MainOperation={
 standard_operation:string;
 st_group:string|null;
 area_id:number|null;
 area_name:string|null;
 area_sort:number|null;
 st_group_sort:number|null;
 operation_sort:number|null;
 planning_sort_order:number|null;
};

export type Area={id:number|string;area_name:string};
export type Operation={area_id:number|string|null;area_name?:string|null;standard_operation:string};
export type RecipeOption={recipe_key:string;recipe_no:string|null;recipe_name:string|null};

export type BatchOption={
 id:number;
 batch_no:string;
 standard_operation:string;
 status:string;
 recipe_key:string|null;
 recipe_no?:string|null;
 recipe_name?:string|null;
 schedule_id?:number|null;
 schedule_status?:string|null;
 resource_code?:string|null;
 schedule_start?:string|null;
 schedule_end?:string|null;
};

export type SnapshotMeta={
 hit:boolean;
 fallback:boolean;
 serveMs:number;
 sourceVersion:number|null;
 refreshedAt:string|null;
 buildMs:number|null;
 candidateCount:number;
 scopeKey:string;
};

export type PlanningScope={
 areaId:string;
 op:string;
 recipeKey:string;
 previousBatchNo:string;
};

export type SelectedTarget={
 id:number;
 candidateId:number;
 standardOperation:string;
 sourceOperation:string;
 routeItem:RouteStatusItem|null;
};
