const SCHEDULE_TIME_ZONE="Asia/Ho_Chi_Minh";

/** Canonical Scheduling formula: End = Start + Duration. */
export function calculateScheduleEnd(
 startValue:string|Date|null|undefined,
 durationMinutes:unknown
){
 if(!startValue)return null;

 const start=startValue instanceof Date
  ?new Date(startValue.getTime())
  :new Date(startValue);
 const duration=Number(durationMinutes);

 if(Number.isNaN(start.getTime())||!Number.isFinite(duration)||duration<=0)
  return null;

 return new Date(start.getTime()+Math.round(duration)*60000);
}

export function formatScheduleTime(value:string|Date|null|undefined){
 if(!value)return "—";
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return "—";

 return date.toLocaleTimeString("en-GB",{
  timeZone:SCHEDULE_TIME_ZONE,
  hour:"2-digit",
  minute:"2-digit"
 });
}

export function calculatedScheduleEndTime(
 startValue:string|Date|null|undefined,
 durationMinutes:unknown
){
 return formatScheduleTime(calculateScheduleEnd(startValue,durationMinutes));
}

// V445: Canonical production-day boundary = 06:00 selected date -> 06:00 next date.
// The production-day OWNER is determined by planned START time in Asia/Ho_Chi_Minh.
// Example: 2026-09-03 00:05 belongs to production date 2026-09-02.
function datePartsInScheduleTimeZone(date:Date){
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:SCHEDULE_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(date);
 const get=(type:string)=>parts.find(x=>x.type===type)?.value||"";
 return {year:get("year"),month:get("month"),day:get("day")};
}

export function getProductionDateString(date:Date):string{
 // Shift the instant back six hours, then read its Vietnam calendar date.
 // This makes local 00:00-05:59 resolve to the PREVIOUS production date.
 const shifted=new Date(date.getTime()-6*60*60*1000);
 const p=datePartsInScheduleTimeZone(shifted);
 return `${p.year}-${p.month}-${p.day}`;
}

export function getProductionDay(date:Date):Date{
 return new Date(`${getProductionDateString(date)}T06:00:00+07:00`);
}

