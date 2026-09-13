import { render } from 'preact';
import { App } from './App';
import 'katex/dist/katex.min.css';
import './styles.css';
render(<App />, document.getElementById('app')!);
