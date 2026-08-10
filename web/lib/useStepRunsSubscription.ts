"use client";
import { useEffect,useState } from "react";
import { createClient } from "graphql-ws";
import { nhost } from "./nhost";
import { STEP_RUNS_SUBSCRIPTION } from "./graphql";
export type StepRun={id:string;status:"pending"|"running"|"succeeded"|"failed"|"paused"|"skipped";output:any;error:string|null;attempt_count:number;approved_by:string|null;workflow_step:{step_order:number;name:string;type:string}};
export function useStepRunsSubscription(runId:string|null){const[stepRuns,setStepRuns]=useState<StepRun[]>([]);const[runStatus,setRunStatus]=useState<string|null>(null);useEffect(()=>{if(!runId)return;let disposed=false;const client=createClient({url:nhost.graphql.getUrl().replace(/^http/,"ws"),connectionParams:async()=>({headers:{Authorization:`Bearer ${nhost.auth.getAccessToken()}`}})});const unsubscribe=client.subscribe({query:STEP_RUNS_SUBSCRIPTION,variables:{runId}},{next:result=>{if(disposed)return;const data=result.data as any;setStepRuns(data.step_runs);setRunStatus(data.workflow_runs_by_pk?.status??null);},error:err=>console.error("step_runs subscription error",err),complete:()=>{}});return()=>{disposed=true;unsubscribe();client.dispose();};},[runId]);return{stepRuns,runStatus};}
