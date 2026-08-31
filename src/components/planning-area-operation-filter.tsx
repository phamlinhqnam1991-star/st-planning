"use client";

import {useMemo,useState} from "react";

type AreaOption={
 id:number;
 area_name:string;
};

type OperationOption={
 standard_operation:string;
 sort_order:number|null;
 st_group:string|null;
 area_id:number|null;
 area_name:string|null;
};

export function PlanningAreaOperationFilter({
 areas,
 operations,
 initialAreaId,
 initialOperation
}:{
 areas:AreaOption[];
 operations:OperationOption[];
 initialAreaId:string;
 initialOperation:string;
}){
 const [areaId,setAreaId]=useState(initialAreaId);
 const [operation,setOperation]=useState(initialOperation);

 const filteredOperations=useMemo(()=>{
  if(!areaId)return operations;

  const id=Number(areaId);
  return operations.filter(x=>Number(x.area_id)===id);
 },[areaId,operations]);

 function changeArea(value:string){
  setAreaId(value);

  if(!value)return;

  const id=Number(value);
  const currentStillValid=operations.some(
   x=>
    x.standard_operation===operation &&
    Number(x.area_id)===id
  );

  if(!currentStillValid){
   setOperation("");
  }
 }

 return <>
  <label>
   Area
   <select
    className="input"
    name="area"
    value={areaId}
    onChange={e=>changeArea(e.target.value)}
   >
    <option value="">All Areas</option>
    {areas.map(a=>
     <option key={a.id} value={a.id}>
      {a.area_name}
     </option>
    )}
   </select>
  </label>

  <label>
   Standard Operation
   <select
    className="input"
    name="op"
    value={operation}
    onChange={e=>setOperation(e.target.value)}
   >
    <option value="">
     {areaId
      ? filteredOperations.length
       ? "Select Operation..."
       : "No Operation in this Area"
      : "Select Operation..."}
    </option>

    {filteredOperations.map(x=>
     <option
      key={`${x.area_id||"none"}-${x.standard_operation}`}
      value={x.standard_operation}
     >
      {x.standard_operation}
      {x.area_name?` · ${x.area_name}`:""}
     </option>
    )}
   </select>

   {areaId&&
    <small className="planning-sub">
     {filteredOperations.length} operations in selected Area
    </small>}
  </label>
 </>;
}
