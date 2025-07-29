import React from 'react';
import { StatusBar } from 'react-native';
import AppNavigator from './navigation/AppNavigator';

function App(): React.JSX.Element {
  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#007bff"
      />
      <AppNavigator />
    </>
  );
}

export default App;
