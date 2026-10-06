// Profile photo (O-Photo): take one or choose from the library, square-crop, shrink,
// upload to the person's own folder in the avatars bucket, then record the path.
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { setProfilePhoto } from './api';
import { supabase } from './supabase';

const SIZE = 512;

export type PickedPhoto = { uri: string; width: number; height: number };

export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/** Shrinks to 512x512 JPEG so a profile photo is a few tens of kilobytes. */
export async function prepareAvatar(photo: PickedPhoto): Promise<string> {
  const side = Math.min(photo.width, photo.height);
  const context = ImageManipulator.ImageManipulator.manipulate(photo.uri);
  if (photo.width !== photo.height) {
    context.crop({
      originX: Math.floor((photo.width - side) / 2),
      originY: Math.floor((photo.height - side) / 2),
      width: side,
      height: side,
    });
  }
  context.resize({ width: SIZE, height: SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 });
  return saved.uri;
}

export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const file = await fetch(localUri);
  const body = await file.arrayBuffer();
  const { error } = await supabase.storage.from('avatars').upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  await setProfilePhoto(path);
  return path;
}
