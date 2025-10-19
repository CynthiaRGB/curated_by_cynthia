import { StatsigProvider, useClientAsyncInit } from '@statsig/react-bindings';
import { StatsigAutoCapturePlugin } from '@statsig/web-analytics';
import { StatsigSessionReplayPlugin } from '@statsig/session-replay';
import { ChatInterface } from './components/ChatInterface'
import './App.css'

function App() {
  const { client } = useClientAsyncInit(
    "client-rMgSYrVqbAl4rBGA85kTbhO5d2F9udbWBzEQWunJ4Md",
    { userID: 'a-user' }, 
    { plugins: [ new StatsigAutoCapturePlugin(), new StatsigSessionReplayPlugin() ] },
  );

  return (
    <StatsigProvider client={client} loadingComponent={<div>Loading...</div>}>
      <div className="app-container">
        <ChatInterface />
      </div>
    </StatsigProvider>
  )
}

export default App
