import jsep from 'jsep';
import fns from './functions';

const Bliss = {};
const value = {};

const Mavo = {jsep, Bliss};

Mavo.Functions = fns(Bliss, value);

export default Mavo;
