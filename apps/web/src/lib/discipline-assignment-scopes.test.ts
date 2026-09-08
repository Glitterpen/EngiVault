import {describe,expect,it} from "vitest";
import {buildDisciplineAssignmentScopes,type DisciplineAssignmentEngineer} from "./discipline-assignment-scopes";

const engineers:DisciplineAssignmentEngineer[]=[{userId:"engineer",name:"Engineer",email:"engineer@example.test",disciplines:["Electrical","Instrumentation"]}];
const documents=[{id:"E1",discipline:"Electrical"},{id:"E2",discipline:" electrical "},{id:"I1",discipline:"Instrumentation"}];
describe("discipline allocation status",()=>{
  it("counts each engineer's assignments separately across multiple disciplines",()=>{
    const scopes=buildDisciplineAssignmentScopes(documents,[{document_id:"E1",user_id:"engineer"},{document_id:"E2",user_id:"engineer"}],engineers);
    expect(scopes[0]).toMatchObject({name:"Electrical",documentCount:2,engineers:[{assignedCount:2,remainingCount:0}]});
    expect(scopes[1]).toMatchObject({name:"Instrumentation",documentCount:1,engineers:[{assignedCount:0,remainingCount:1}]});
  });
  it("does not count another engineer, removed document or duplicate row as coverage",()=>{
    const scopes=buildDisciplineAssignmentScopes(documents,[{document_id:"E1",user_id:"engineer"},{document_id:"E1",user_id:"engineer"},{document_id:"E2",user_id:"another"},{document_id:"archived",user_id:"engineer"}],engineers);
    expect(scopes[0].engineers[0]).toMatchObject({assignedCount:1,remainingCount:1});
  });
  it("new or unassigned deliverables make a completed allocation outstanding again",()=>{
    const assignment=[{document_id:"E1",user_id:"engineer"}];
    expect(buildDisciplineAssignmentScopes(documents.slice(0,1),assignment,engineers)[0].engineers[0].remainingCount).toBe(0);
    expect(buildDisciplineAssignmentScopes(documents,assignment,engineers)[0].engineers[0].remainingCount).toBe(1);
    expect(buildDisciplineAssignmentScopes(documents,[],engineers)[0].engineers[0].remainingCount).toBe(2);
  });
  it("does not infer permission from an assignment or combine punctuation-sensitive scopes",()=>{
    const scopes=buildDisciplineAssignmentScopes([{id:"A",discipline:"Civil / Structural"},{id:"B",discipline:"Civil Structural"}],[{document_id:"B",user_id:"engineer"}],
      [{...engineers[0],disciplines:["civil / structural"]}]);
    expect(scopes.find(scope=>scope.name==="Civil / Structural")?.engineers).toHaveLength(1);
    expect(scopes.find(scope=>scope.name==="Civil Structural")?.engineers).toEqual([]);
  });
});
