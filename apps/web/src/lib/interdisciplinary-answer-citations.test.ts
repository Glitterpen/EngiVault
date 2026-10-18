import {expect,it} from "vitest";
import {normaliseInterdisciplinaryCitations} from "./interdisciplinary-answer-citations";

it.each([
  {answer:"Pressure is 50 barg [3].",ids:[3],expected:"Pressure is 50 barg [1]."},
  {answer:"Two revisions agree [1, 3]. See also [3].",ids:[1,3],expected:"Two revisions agree [1] [2]. See also [2]."},
  {answer:"Both sources [ 4; 2 ].",ids:[2,4],expected:"Both sources [2] [1]."},
  {answer:"Unsupported reference [2].",ids:[1],expected:null},
  {answer:"Missing citation.",ids:[1],expected:null},
  {answer:"One source only [1].",ids:[1,3],expected:null},
  {answer:"Insufficient evidence.",ids:[],expected:"Insufficient evidence."},
])("keeps answer and source labels consistent: $answer",({answer,ids,expected})=>{
  expect(normaliseInterdisciplinaryCitations(answer,ids)).toBe(expected);
});
