import { render } from 'preact';
import './style.css';
import { App } from './App';
import { demarrerModuleHorsLigne } from './ui/maj.ts';

demarrerModuleHorsLigne();
render(<App />, document.getElementById('app')!);
