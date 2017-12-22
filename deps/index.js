// Const self = {};
import jsep from 'jsep';
import Bliss from 'blissfuljs';

console.dir(jsep);
console.dir(Bliss);
window.jsep = jsep;
self.jsep = jsep;
console.log(jsep.addUnaryOp);
console.log(jsep.addBinaryOp);
