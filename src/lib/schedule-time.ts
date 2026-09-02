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

// v187: Production day boundary (06:00 → 06:00 next day)
export function getProductionDay(date:Date):Date{
 const d=new Date(date);
 d.setHours(6,0,0,0);
 return d;
}

