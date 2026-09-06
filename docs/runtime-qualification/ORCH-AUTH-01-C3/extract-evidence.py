"""Inspect every retained archive member before extraction into a new directory."""
import hashlib,json,pathlib,sys,tarfile
source=pathlib.Path(sys.argv[1]).resolve(strict=True)
destination=pathlib.Path(sys.argv[2]).absolute()
assert source.is_file() and not source.is_symlink()
assert not destination.exists() and destination.parent.resolve(strict=True)==destination.parent
with tarfile.open(source,'r:gz') as archive:
    members=archive.getmembers()
    assert 0<len(members)<=10000
    assert sum(member.size for member in members)<=256*1024**2
    names=set()
    for member in members:
        path=pathlib.PurePosixPath(member.name)
        assert member.isdir() or member.isfile()
        assert not path.is_absolute() and path.parts
        assert not any(part in ('..','.') or ':' in part or '\\' in part for part in path.parts)
        assert member.name not in names
        names.add(member.name)
        target=destination.joinpath(*path.parts)
        assert target.is_relative_to(destination)
    inspection={'archive':str(source),'sha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'members':[{'path':member.name,'bytes':member.size,'type':'directory' if member.isdir() else 'file'} for member in members]}
    # Write the complete member inspection before any archived member is written.
    inspectionPath=destination.parent/(destination.name+'-inspection.json')
    with inspectionPath.open('x') as output:output.write(json.dumps(inspection,indent=2)+'\n')
    destination.mkdir()
    archive.extractall(destination,members=members,filter='data')
print(json.dumps({'destination':str(destination),'members':len(members),'sha256':inspection['sha256']}))
