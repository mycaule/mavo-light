import jsep from 'jsep';
import fns from './functions';

import Mocks from './mocks/objects';

const Bliss = {};

const Mavo = {jsep, Bliss};

Mavo.Functions = fns(Mavo, Bliss, Mocks.location);

export default Mavo;
