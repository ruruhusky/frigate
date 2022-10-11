import { h } from 'preact';
import * as CameraImage from '../../components/CameraImage';
import * as Mqtt from '../../api/mqtt';
import Cameras from '../Cameras';
import { fireEvent, render, screen, waitForElementToBeRemoved } from 'testing-library';

describe('Recording Route', () => {
  beforeEach(() => {
    jest.spyOn(CameraImage, 'default').mockImplementation(() => <div data-testid="camera-image" />);
    jest.spyOn(Mqtt, 'useMqtt').mockImplementation(() => ({ value: { payload: 'OFF' }, send: jest.fn() }));
  });

  test('shows an ActivityIndicator if not yet loaded', async () => {
    render(<Cameras />);
    expect(screen.queryByLabelText('Loading…')).toBeInTheDocument();
  });



  test('shows no recordings warning', async () => {
    render(<Cameras />);

    await waitForElementToBeRemoved(() => screen.queryByLabelText('Loading…'));

    expect(screen.queryAllByText('No Recordings Found')).toBeInTheDocument();
  });
});
